import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ParkingSpace, SpaceStatus, SpaceType } from '../entities/ParkingSpace.entity';
import { Vehicle, VehicleType } from '../entities/Vehicle.entity';
import { ParkingLog } from '../entities/ParkingLog.entity';
import { AssignmentLog } from '../entities/AssignmentLog.entity';
import { EventsGateway } from '../events/events.gateway';

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
        private eventsGateway: EventsGateway,
    ) { }

    async assignSpace(plateNumber: string, type: VehicleType): Promise<any> {
        // 1. Find or Create Vehicle
        let vehicle = await this.vehicleRepository.findOne({ where: { plateNumber } });
        if (!vehicle) {
            vehicle = this.vehicleRepository.create({ plateNumber, type });
            await this.vehicleRepository.save(vehicle);
        }

        // 2. Find Available Space
        let space = await this.spaceRepository.findOne({
            where: {
                status: SpaceStatus.EMPTY,
                type: type === VehicleType.EV ? SpaceType.EV :
                    type === VehicleType.DISABLED ? SpaceType.DISABLED :
                        SpaceType.GENERAL
            },
            order: { spaceCode: 'ASC' }
        });

        if (!space && type !== VehicleType.DISABLED) {
            space = await this.spaceRepository.findOne({
                where: { status: SpaceStatus.EMPTY, type: SpaceType.GENERAL },
                order: { spaceCode: 'ASC' }
            });
        }

        if (!space) {
            throw new NotFoundException('No available parking space found.');
        }

        // 3. Reserve Space
        space.status = SpaceStatus.RESERVED;
        space.currentVehicleId = vehicle.id;
        await this.spaceRepository.save(space);

        // 4. Create Assignment Log
        const assignmentLog = this.assignmentLogRepository.create({
            space,
            vehicle,
            reason: 'ENTRY_ASSIGNMENT',
        });
        await this.assignmentLogRepository.save(assignmentLog);

        // 5. Broadcast Update
        await this.broadcastSpaceUpdate(space, 'RESERVED', vehicle.plateNumber);

        return {
            message: 'Space assigned',
            space: space.spaceCode,
            spaceId: space.id,
            vehicle: vehicle.plateNumber,
        };
    }

    async occupySpace(plateNumber: string, spaceIdentifier: string): Promise<any> {
        const vehicle = await this.vehicleRepository.findOne({ where: { plateNumber } });
        if (!vehicle) throw new NotFoundException('Vehicle not found');

        // Try to find by ID first, then by Code
        let targetSpace = await this.spaceRepository.findOne({
            where: { id: spaceIdentifier },
            relations: ['zone', 'zone.parkingLot']
        });

        if (!targetSpace) {
            targetSpace = await this.spaceRepository.findOne({
                where: { spaceCode: spaceIdentifier },
                relations: ['zone', 'zone.parkingLot']
            });
        }

        if (!targetSpace) throw new NotFoundException('Space not found');

        // Conflict Logic
        if (targetSpace.status === SpaceStatus.RESERVED && targetSpace.currentVehicleId !== vehicle.id) {
            // Stealing someone else's spot!
            const victimVehicleId = targetSpace.currentVehicleId;
            if (victimVehicleId) {
                const victimVehicle = await this.vehicleRepository.findOne({ where: { id: victimVehicleId } });

                if (victimVehicle) {
                    // Reassign Victim
                    try {
                        await this.reassignVehicle(victimVehicle);
                    } catch (e) {
                        console.error('Failed to reassign victim:', e);
                    }
                }
            }
        } else if (targetSpace.status === SpaceStatus.OCCUPIED) {
            // Ideally we shouldn't park in an occupied spot, but for simulation maybe we allow "crashing" or just fail.
            // Let's fail for now.
            throw new BadRequestException('Space is already occupied.');
        }

        // Occupy the space
        targetSpace.status = SpaceStatus.OCCUPIED;
        targetSpace.currentVehicleId = vehicle.id;
        await this.spaceRepository.save(targetSpace);

        // Create Parking Log
        const parkingLog = this.parkingLogRepository.create({
            space: targetSpace,
            vehicle,
            entryTime: new Date(),
            status: 'PARKED',
        });
        await this.parkingLogRepository.save(parkingLog);

        // Broadcast Update
        await this.broadcastSpaceUpdate(targetSpace, 'OCCUPIED', vehicle.plateNumber);

        return {
            message: 'Vehicle parked',
            space: targetSpace.spaceCode,
            vehicle: vehicle.plateNumber,
        };
    }

    private async reassignVehicle(vehicle: Vehicle) {
        // Find new space
        let space = await this.spaceRepository.findOne({
            where: {
                status: SpaceStatus.EMPTY,
                type: vehicle.type === VehicleType.EV ? SpaceType.EV :
                    vehicle.type === VehicleType.DISABLED ? SpaceType.DISABLED :
                        SpaceType.GENERAL
            },
            order: { spaceCode: 'ASC' }
        });

        if (!space && vehicle.type !== VehicleType.DISABLED) {
            space = await this.spaceRepository.findOne({
                where: { status: SpaceStatus.EMPTY, type: SpaceType.GENERAL },
                order: { spaceCode: 'ASC' }
            });
        }

        if (space) {
            space.status = SpaceStatus.RESERVED;
            space.currentVehicleId = vehicle.id;
            await this.spaceRepository.save(space);

            const assignmentLog = this.assignmentLogRepository.create({
                space,
                vehicle,
                reason: 'REASSIGNMENT_CONFLICT',
            });
            await this.assignmentLogRepository.save(assignmentLog);

            await this.broadcastSpaceUpdate(space, 'RESERVED', vehicle.plateNumber);
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
            await this.broadcastSpaceUpdate(space, 'EMPTY', null);
        }

        // Update Log
        const log = await this.parkingLogRepository.findOne({
            where: { vehicle: { id: vehicle.id }, status: 'PARKED' },
            order: { entryTime: 'DESC' }
        });
        if (log) {
            log.status = 'EXITED';
            log.exitTime = new Date();
            await this.parkingLogRepository.save(log);
        }

        return { message: 'Vehicle exited' };
    }

    private async broadcastSpaceUpdate(space: ParkingSpace, status: string, plateNumber: string | null) {
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
                    vehiclePlate: plateNumber
                }
            );
        }
    }

    // Deprecated or Wrapper
    async enterVehicle(plateNumber: string, type: VehicleType): Promise<any> {
        const assigned = await this.assignSpace(plateNumber, type);
        return this.occupySpace(plateNumber, assigned.spaceId);
    }

    async getAllSpaces(): Promise<ParkingSpace[]> {
        return this.spaceRepository.find({
            relations: ['zone', 'zone.parkingLot'],
            order: { spaceCode: 'ASC' }
        });
    }
}
