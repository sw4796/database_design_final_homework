import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, DataSource } from 'typeorm';
import { ParkingSpace, SpaceStatus, SpaceType } from '../entities/ParkingSpace.entity';
import { Vehicle, VehicleType } from '../entities/Vehicle.entity';
import { ParkingLog } from '../entities/ParkingLog.entity';
import { AssignmentLog, AssignmentStatus } from '../entities/AssignmentLog.entity';
import { ParkingLot } from '../entities/ParkingLot.entity';
import { ParkingZone } from '../entities/ParkingZone.entity';
import { EventsGateway } from '../events/events.gateway';
import { ErrorLog } from '../entities/ErrorLog.entity';

@Injectable()
export class ParkingService {
    constructor(
        @InjectRepository(ParkingSpace)
        private spaceRepository: Repository<ParkingSpace>,
        @InjectRepository(Vehicle)
        private vehicleRepository: Repository<Vehicle>,
        @InjectRepository(ParkingLog)
        private parkingLogRepository: Repository<ParkingLog>,
        @InjectRepository(AssignmentLog)
        private assignmentLogRepository: Repository<AssignmentLog>,
        @InjectRepository(ParkingLot)
        private parkingLotRepository: Repository<ParkingLot>,
        @InjectRepository(ParkingZone)
        private parkingZoneRepository: Repository<ParkingZone>,
        @InjectRepository(ErrorLog)
        private errorLogRepository: Repository<ErrorLog>,
        private eventsGateway: EventsGateway,
        private dataSource: DataSource,
    ) { }

    async getLots(): Promise<ParkingLot[]> {
        return this.parkingLotRepository.find();
    }

    async getZones(lotId: string): Promise<ParkingZone[]> {
        return this.parkingZoneRepository.find({
            where: { parkingLot: { id: lotId } },
            order: { name: 'ASC' }
        });
    }

    async getSpacesByZone(zoneId: string): Promise<ParkingSpace[]> {
        return this.spaceRepository.find({
            where: { zone: { id: zoneId } },
            relations: ['vehicle'],
            order: { spaceCode: 'ASC' }
        });
    }

    async assignSpace(plateNumber: string, type: VehicleType, lotId?: string): Promise<any> {
        const txId = `Tx-${Math.floor(Math.random() * 10000)}`;
        const logPrefix = `[${txId}] Car-${plateNumber}`;
        console.log(`${logPrefix} 배정 요청 접수`);

        // Broadcast initial attempt
        if (lotId) {
            this.eventsGateway.broadcastLog(lotId, `${logPrefix} 배정 요청 접수`, 'INFO');
        }

        return this.dataSource.transaction(async manager => {
            const spaceRepo = manager.getRepository(ParkingSpace);
            const vehicleRepo = manager.getRepository(Vehicle);
            const assignmentLogRepo = manager.getRepository(AssignmentLog);
            const parkingLogRepo = manager.getRepository(ParkingLog);

            // 1. Find or Create Vehicle
            let vehicle = await vehicleRepo.findOne({ where: { plateNumber } });
            if (!vehicle) {
                vehicle = vehicleRepo.create({ plateNumber, type });
                await vehicleRepo.save(vehicle);
            }

            // Note: We are skipping clearVehicleFromSpaces for this transaction demo to keep it simple and focused on the locking.
            // In a real scenario, we would need to handle the clearing within the transaction as well.

            // 2. Find Available Space
            // Filter by lotId if provided
            const whereCondition: any = {
                status: SpaceStatus.EMPTY,
                type: type === VehicleType.EV ? SpaceType.EV :
                    type === VehicleType.DISABLED ? SpaceType.DISABLED :
                        SpaceType.GENERAL
            };

            if (lotId) {
                whereCondition.zone = { parkingLot: { id: lotId } };
            }

            console.log(`[${txId}] Car-${plateNumber} 배정 시작... (조회 & Lock 획득 시도)`);
            if (lotId) {
                this.eventsGateway.broadcastLog(lotId, `${logPrefix} 배정 시작... (조회 & Lock 획득 시도)`, 'WARN');
            }

            let space = await spaceRepo.findOne({
                where: whereCondition,
                order: { spaceCode: 'ASC' },
                relations: ['zone', 'zone.parkingLot'],
                lock: { mode: 'pessimistic_write' } // <--- DB Row Lock
            });

            if (!space && type !== VehicleType.DISABLED) {
                // Fallback to GENERAL if specific type not found (except DISABLED)
                const fallbackCondition: any = {
                    status: SpaceStatus.EMPTY,
                    type: SpaceType.GENERAL
                };
                if (lotId) {
                    fallbackCondition.zone = { parkingLot: { id: lotId } };
                }

                space = await spaceRepo.findOne({
                    where: fallbackCondition,
                    order: { spaceCode: 'ASC' },
                    relations: ['zone', 'zone.parkingLot'],
                    lock: { mode: 'pessimistic_write' } // <--- DB Row Lock
                });
            }

            if (!space) {
                console.log(`[${txId}] Car-${plateNumber} 실패: 가용 주차면 없음`);
                if (lotId) this.eventsGateway.broadcastLog(lotId, `${logPrefix} 실패: 가용 주차면 없음`, 'ERROR');
                throw new NotFoundException('No available parking space found.');
            }

            console.log(`[${txId}] Car-${plateNumber} Lock 획득 성공. (2초 지연 시작)`);
            if (lotId) {
                this.eventsGateway.broadcastLog(lotId, `${logPrefix} Lock 획득 성공. (2초 지연 시작 ⏳)`, 'WARN');
            }

            await new Promise(resolve => setTimeout(resolve, 2000)); // Artificial Delay

            // 3. Reserve Space
            space.status = SpaceStatus.RESERVED;
            space.currentVehicleId = vehicle.id;
            await spaceRepo.save(space);

            // 4. Create Assignment Log
            const assignmentLog = assignmentLogRepo.create({
                space,
                vehicle,
                reason: 'ENTRY_ASSIGNMENT',
            });
            await assignmentLogRepo.save(assignmentLog);

            // 5. Create Initial Parking Log (Entry Time)
            const parkingLog = parkingLogRepo.create({
                parkingSpace: space,
                vehicle,
                entryTime: new Date(),
                status: 'ASSIGNED', // New status for assigned but not yet parked
            });
            await parkingLogRepo.save(parkingLog);

            console.log(`[${txId}] Car-${plateNumber} 배정 완료 (Commit & Lock 해제) -> ${space.spaceCode}`);
            if (lotId) {
                this.eventsGateway.broadcastLog(lotId, `${logPrefix} 배정 완료 (Commit & Lock 해제) -> ${space.spaceCode}`, 'SUCCESS');
            }

            // 5. Broadcast Update (Execute after commit effectively, but here is fine as it's just event)
            // We use the service method which uses the separate repo, but that's okay for broadcast.
            // To be safe, we can just fire and forget or await.
            await this.broadcastSpaceUpdate(space, 'RESERVED', vehicle.plateNumber, `${vehicle.plateNumber} 입차: ${space.spaceCode} 배정`);

            return {
                message: 'Space assigned',
                space: space.spaceCode,
                spaceId: space.id,
                vehicle: vehicle.plateNumber,
                lotName: space.zone?.parkingLot?.name,
                zoneName: space.zone?.name
            };
        });
    }

    async occupySpace(plateNumber: string, spaceIdentifier: string, lotId?: string): Promise<any> {
        const vehicle = await this.vehicleRepository.findOne({ where: { plateNumber } });
        if (!vehicle) throw new NotFoundException('Vehicle not found');

        // Try to find by ID first
        let targetSpace = await this.spaceRepository.findOne({
            where: { id: spaceIdentifier },
            relations: ['zone', 'zone.parkingLot']
        });

        // If found by ID, verify Lot ID if provided
        if (targetSpace && lotId && targetSpace.zone?.parkingLot?.id !== lotId) {
            // If ID matches but Lot doesn't, it's a cross-lot attempt (or ID collision which is impossible for UUID)
            // But more likely, the user provided an ID from another lot.
            // We should reject this.
            throw new BadRequestException(`Space ${targetSpace.spaceCode} belongs to a different parking lot.`);
        }

        // If not found by ID, try by Code
        if (!targetSpace) {
            const whereCondition: any = { spaceCode: spaceIdentifier };
            if (lotId) {
                whereCondition.zone = { parkingLot: { id: lotId } };
            }

            targetSpace = await this.spaceRepository.findOne({
                where: whereCondition,
                relations: ['zone', 'zone.parkingLot']
            });
        }

        if (!targetSpace) throw new NotFoundException(`Space ${spaceIdentifier} not found` + (lotId ? ` in this lot` : ''));

        let victimVehicle: Vehicle | null = null;

        // Conflict Logic
        if (targetSpace.status === SpaceStatus.RESERVED && targetSpace.currentVehicleId !== vehicle.id) {
            // Stealing someone else's spot!
            const victimVehicleId = targetSpace.currentVehicleId;
            if (victimVehicleId) {
                victimVehicle = await this.vehicleRepository.findOne({ where: { id: victimVehicleId } });

                // [SPOT_THEFT] Log Error Immediately
                if (victimVehicle) {
                    console.warn(`[ErrorLog] SPOT_THEFT: Space assigned to ${victimVehicle.plateNumber} but occupied by ${vehicle.plateNumber}.`);

                    // Find Assignment Log for Victim
                    const victimAssignment = await this.assignmentLogRepository.findOne({
                        where: { vehicle: { id: victimVehicle.id }, status: AssignmentStatus.ACTIVE },
                        order: { assignedAt: 'DESC' }
                    });

                    const errorLog = this.errorLogRepository.create({
                        space: targetSpace,
                        assignmentLog: victimAssignment || undefined,
                        sensorState: 'OCCUPIED',
                        dbState: targetSpace.status,
                        errorType: 'SPOT_THEFT',
                        detectedAt: new Date(),
                        description: `Space assigned to ${victimVehicle.plateNumber} but occupied by ${vehicle.plateNumber}.`
                    });
                    await this.errorLogRepository.save(errorLog);

                    if (targetSpace.zone?.parkingLot) {
                        this.eventsGateway.broadcastLog(
                            targetSpace.zone.parkingLot.id,
                            `🚨 SPOT_THEFT: ${victimVehicle.plateNumber} 자리 뺏김 (by ${vehicle.plateNumber})`,
                            'ERROR'
                        );
                    }
                }
            }
        } else if (targetSpace.status === SpaceStatus.OCCUPIED && targetSpace.currentVehicleId !== vehicle.id) {
            throw new BadRequestException('Space is already occupied.');
        }

        // Ensure the vehicle is not assigned to any OTHER space (e.g. it was reserved elsewhere)
        await this.clearVehicleFromSpaces(vehicle.id, targetSpace.id);

        // Occupy the space
        targetSpace.status = SpaceStatus.OCCUPIED;
        targetSpace.currentVehicleId = vehicle.id;
        await this.spaceRepository.save(targetSpace);

        // Reassign Victim AFTER occupation to ensure they don't get the same spot back
        if (victimVehicle) {
            try {
                console.log(`Reassigning victim ${victimVehicle.plateNumber} from ${targetSpace.spaceCode}`);

                // Use the Lot ID from the target space to ensure they stay in the same lot
                const currentLotId = targetSpace.zone?.parkingLot?.id || lotId;

                await this.reassignVehicle(victimVehicle, currentLotId);
            } catch (e) {
                console.error('Failed to reassign victim:', e);
            }
        }

        // Update Parking Log (Find the ASSIGNED log)
        let parkingLog = await this.parkingLogRepository.findOne({
            where: { vehicle: { id: vehicle.id }, status: 'ASSIGNED' },
            order: { entryTime: 'DESC' }
        });

        if (parkingLog) {
            parkingLog.status = 'PARKED';
            parkingLog.parkingSpace = targetSpace; // Update space in case they parked in a different spot than assigned
            await this.parkingLogRepository.save(parkingLog);
        } else {
            // Fallback if no ASSIGNED log found (shouldn't happen in normal flow but good for robustness)
            parkingLog = this.parkingLogRepository.create({
                parkingSpace: targetSpace,
                vehicle,
                entryTime: new Date(),
                status: 'PARKED',
            });
            await this.parkingLogRepository.save(parkingLog);
        }

        // Broadcast Update
        await this.broadcastSpaceUpdate(targetSpace, 'OCCUPIED', vehicle.plateNumber, `${targetSpace.spaceCode}: ${vehicle.plateNumber} 주차 완료`);

        // Trigger Sensor Event Processing (Check for errors)
        await this.processSensorEvent(targetSpace.id, 'OCCUPIED');

        // Update Assignment Log Status to COMPLETED
        const activeAssignment = await this.assignmentLogRepository.findOne({
            where: {
                vehicle: { id: vehicle.id },
                status: AssignmentStatus.ACTIVE
            },
            order: { assignedAt: 'DESC' }
        });

        if (activeAssignment) {
            activeAssignment.status = AssignmentStatus.COMPLETED;
            await this.assignmentLogRepository.save(activeAssignment);
        }

        return {
            message: 'Vehicle parked',
            space: targetSpace.spaceCode,
            vehicle: vehicle.plateNumber,
        };
    }


    private async clearVehicleFromSpaces(vehicleId: string, excludeSpaceId?: string) {
        const spaces = await this.spaceRepository.find({ where: { currentVehicleId: vehicleId } });
        for (const space of spaces) {
            if (excludeSpaceId && space.id === excludeSpaceId) continue;

            space.currentVehicleId = null;
            space.status = SpaceStatus.EMPTY;
            await this.spaceRepository.save(space);
            await this.broadcastSpaceUpdate(space, 'EMPTY', null, `[시스템] ${vehicleId} 재배정을 위해 ${space.spaceCode} 비움`);
        }
    }

    async exitVehicle(plateNumber: string): Promise<any> {
        const vehicle = await this.vehicleRepository.findOne({ where: { plateNumber } });
        if (!vehicle) throw new NotFoundException('Vehicle not found');

        const space = await this.spaceRepository.findOne({ where: { currentVehicleId: vehicle.id } });
        if (space) {
            space.status = SpaceStatus.EMPTY;
            space.currentVehicleId = null;
            await this.spaceRepository.save(space);
            await this.broadcastSpaceUpdate(space, 'EMPTY', null, `${vehicle.plateNumber} 출차 완료`);
        }

        // Update Log
        const log = await this.parkingLogRepository.findOne({
            where: { vehicle: { id: vehicle.id }, status: 'PARKED' },
            order: { entryTime: 'DESC' }
        });
        if (log) {
            log.status = 'EXITED';
            // exitTime is NOT set here. It is set upon payment.
            // log.exitTime = new Date(); 
            await this.parkingLogRepository.save(log);
        }

        return { message: 'Vehicle exited' };
    }

    private async broadcastSpaceUpdate(space: ParkingSpace, status: string, plateNumber: string | null, message?: string) {
        const spaceWithRelations = await this.spaceRepository.findOne({
            where: { id: space.id },
            relations: ['zone', 'zone.parkingLot']
        });

        if (spaceWithRelations?.zone?.parkingLot) {
            this.eventsGateway.broadcastToLot(
                spaceWithRelations.zone.parkingLot.id,
                'parkingUpdate',
                {
                    spaceId: space.id,
                    spaceCode: space.spaceCode, // Add spaceCode for frontend matching
                    status,
                    vehiclePlate: plateNumber,
                    message // Custom log message
                }
            );
        }
    }

    // Deprecated or Wrapper
    async enterVehicle(plateNumber: string, type: VehicleType, lotId?: string): Promise<any> {
        const assigned = await this.assignSpace(plateNumber, type, lotId);
        return this.occupySpace(plateNumber, assigned.spaceId, lotId);
    }

    async getAllSpaces(lotId?: string): Promise<ParkingSpace[]> {
        const whereCondition: any = {};

        if (lotId) {
            whereCondition.zone = { parkingLot: { id: lotId } };
        }

        return this.spaceRepository.find({
            where: whereCondition,
            relations: ['zone', 'zone.parkingLot', 'vehicle'],
            order: { spaceCode: 'ASC' }
        });
    }

    async getAllVehicles(lotId?: string): Promise<Vehicle[]> {
        // Only return vehicles that are currently assigned to a space (Reserved or Occupied)
        // If lotId is provided, filter by spaces in that lot
        const whereCondition: any = { currentVehicleId: Not(IsNull()) };

        if (lotId) {
            whereCondition.zone = { parkingLot: { id: lotId } };
        }

        const spaces = await this.spaceRepository.find({
            where: whereCondition,
            relations: ['vehicle', 'zone', 'zone.parkingLot'],
            order: { spaceCode: 'ASC' }
        });

        // Filter out any potential nulls (though query shouldn't return them) and map to vehicle
        const vehicles = spaces
            .map(space => space.vehicle)
            .filter(vehicle => vehicle !== null && vehicle !== undefined);

        // Remove duplicates if any (though 1:1 constraint prevents this, good for safety)
        const uniqueVehicles = Array.from(new Map(vehicles.map(v => [v.id, v])).values());

        return uniqueVehicles.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));
    }
    async closeSpot(spaceId: string): Promise<any> {
        const space = await this.spaceRepository.findOne({ where: { id: spaceId }, relations: ['zone', 'zone.parkingLot'] });
        if (!space) throw new NotFoundException('Space not found');

        if (space.status === SpaceStatus.CLOSED) return { message: 'Space already closed' };

        // If occupied or reserved, reassign the vehicle
        if (space.currentVehicleId) {
            const vehicle = await this.vehicleRepository.findOne({ where: { id: space.currentVehicleId } });
            if (vehicle) {
                await this.reassignVehicle(vehicle, space.zone?.parkingLot?.id);
            }
        }

        space.status = SpaceStatus.CLOSED;
        space.currentVehicleId = null;
        await this.spaceRepository.save(space);
        await this.broadcastSpaceUpdate(space, 'CLOSED', null, `${space.spaceCode} 폐쇄됨`);
        return { message: 'Space closed' };
    }

    async openSpot(spaceId: string): Promise<any> {
        const space = await this.spaceRepository.findOne({ where: { id: spaceId }, relations: ['zone', 'zone.parkingLot'] });
        if (!space) throw new NotFoundException('Space not found');

        if (space.status !== SpaceStatus.CLOSED) return { message: 'Space is not closed' };

        space.status = SpaceStatus.EMPTY;
        await this.spaceRepository.save(space);
        await this.broadcastSpaceUpdate(space, 'EMPTY', null, `${space.spaceCode} 개방됨`);

        return { message: 'Space opened' };
    }

    async reassignVehicle(vehicle: Vehicle, lotId?: string): Promise<void> {
        const whereCondition: any = {
            status: SpaceStatus.EMPTY,
            type: vehicle.type === VehicleType.EV ? SpaceType.EV :
                vehicle.type === VehicleType.DISABLED ? SpaceType.DISABLED :
                    SpaceType.GENERAL
        };

        if (lotId) {
            whereCondition.zone = { parkingLot: { id: lotId } };
        }

        // Find new space
        let space = await this.spaceRepository.findOne({
            where: whereCondition,
            order: { spaceCode: 'ASC' },
            relations: ['zone', 'zone.parkingLot']
        });

        if (!space && vehicle.type !== VehicleType.DISABLED) {
            const fallbackCondition: any = { status: SpaceStatus.EMPTY, type: SpaceType.GENERAL };
            if (lotId) {
                fallbackCondition.zone = { parkingLot: { id: lotId } };
            }

            space = await this.spaceRepository.findOne({
                where: fallbackCondition,
                order: { spaceCode: 'ASC' },
                relations: ['zone', 'zone.parkingLot']
            });
        }

        if (space) {
            console.log(`[Reassign] Found new space ${space.spaceCode} for ${vehicle.plateNumber}`);

            // 1. Cancel Old Assignment
            const oldAssignment = await this.assignmentLogRepository.findOne({
                where: { vehicle: { id: vehicle.id }, status: AssignmentStatus.ACTIVE },
                order: { assignedAt: 'DESC' }
            });
            if (oldAssignment) {
                oldAssignment.status = AssignmentStatus.CANCELLED;
                await this.assignmentLogRepository.save(oldAssignment);
            }

            // 2. Reserve New Space
            space.status = SpaceStatus.RESERVED;
            space.currentVehicleId = vehicle.id;
            await this.spaceRepository.save(space);

            // 3. Create New Assignment
            const assignmentLog = this.assignmentLogRepository.create({
                space,
                vehicle,
                reason: 'REASSIGNMENT_CONFLICT',
                status: AssignmentStatus.ACTIVE
            });
            await this.assignmentLogRepository.save(assignmentLog);

            // 4. Update ParkingLog
            const parkingLog = await this.parkingLogRepository.findOne({
                where: { vehicle: { id: vehicle.id }, status: 'ASSIGNED' },
                order: { entryTime: 'DESC' }
            });
            if (parkingLog) {
                parkingLog.parkingSpace = space;
                await this.parkingLogRepository.save(parkingLog);
            }

            await this.broadcastSpaceUpdate(space, 'RESERVED', vehicle.plateNumber, `배정 충돌 발생 ${vehicle.plateNumber} 재배정 실시: ${space.spaceCode}으로 재배정`);
        } else {
            console.warn(`[Reassign] Failed to find space for ${vehicle.plateNumber} in lot ${lotId}`);

            // If we fail to reassign, mark as EXITED
            const parkingLog = await this.parkingLogRepository.findOne({
                where: { vehicle: { id: vehicle.id }, status: 'ASSIGNED' },
                order: { entryTime: 'DESC' }
            });
            if (parkingLog) {
                parkingLog.status = 'EXITED';
                parkingLog.exitTime = new Date();
                await this.parkingLogRepository.save(parkingLog);
            }
        }
    }

    async processSensorEvent(spaceId: string, sensorState: 'OCCUPIED' | 'EMPTY', detectedAt: Date = new Date()): Promise<void> {
        const space = await this.spaceRepository.findOne({
            where: { id: spaceId },
            relations: ['zone', 'zone.parkingLot']
        });

        if (!space) throw new NotFoundException('Space not found');

        // 1. Fetch Physical State (ParkingLog - Who is actually parked?)
        const parkingLog = await this.parkingLogRepository.findOne({
            where: { parkingSpace: { id: spaceId }, exitTime: IsNull() },
            relations: ['vehicle'],
            order: { entryTime: 'DESC' }
        });

        // 2. Fetch Logical Plan (AssignmentLog - Who should be here?)
        // Get the LATEST assignment
        const latestAssignment = await this.assignmentLogRepository.findOne({
            where: { space: { id: spaceId } },
            order: { assignedAt: 'DESC' },
            relations: ['vehicle']
        });

        let errorType = '';
        let description = '';
        let shouldLog = false;

        // Case 1: UNAUTHORIZED_OCCUPANCY (무단 점유)
        // Condition: Occupied AND (No assignment OR Latest assignment is not ACTIVE)
        // EXCEPTION: If the latest assignment is CANCELLED, it means a reassignment just happened (likely Spot Theft), so ignore.
        if (sensorState === 'OCCUPIED' && parkingLog) {
            if (!latestAssignment || (latestAssignment.status !== AssignmentStatus.ACTIVE && latestAssignment.status !== AssignmentStatus.CANCELLED)) {
                errorType = 'UNAUTHORIZED_OCCUPANCY';
                description = `Vehicle ${parkingLog.vehicle.plateNumber} parked without active assignment.`;
                shouldLog = true;
            }
        }

        // Case 2: SPOT_THEFT (자리 뺏김) -> Moved to occupySpace to handle race condition
        // We do NOT check it here anymore to avoid duplicates.

        // Case 3: ASSIGNMENT_EXPIRED (노쇼)
        // Condition: Empty AND Active Assignment AND Time > 10min
        if (sensorState === 'EMPTY' && !parkingLog && latestAssignment && latestAssignment.status === AssignmentStatus.ACTIVE) {
            const timeoutMs = 10 * 60 * 1000;
            const timeSinceAssignment = detectedAt.getTime() - latestAssignment.assignedAt.getTime();

            if (timeSinceAssignment > timeoutMs) {
                errorType = 'ASSIGNMENT_EXPIRED';
                description = `Vehicle ${latestAssignment.vehicle.plateNumber} failed to park within 10 minutes.`;
                shouldLog = true;

                // Mark as EXPIRED to prevent duplicate logs
                latestAssignment.status = AssignmentStatus.EXPIRED;
                await this.assignmentLogRepository.save(latestAssignment);
            }
        }

        if (shouldLog) {
            console.warn(`[ErrorLog] ${errorType}: ${description}`);

            const errorLog = this.errorLogRepository.create({
                space,
                parkingLog: parkingLog || undefined,
                assignmentLog: latestAssignment || undefined,
                sensorState,
                dbState: space.status,
                errorType,
                detectedAt,
                description
            });
            await this.errorLogRepository.save(errorLog);

            if (space.zone?.parkingLot) {
                this.eventsGateway.broadcastLog(
                    space.zone.parkingLot.id,
                    `🚨 ${errorType}: ${description}`,
                    'ERROR'
                );
            }
        }
    }
}
