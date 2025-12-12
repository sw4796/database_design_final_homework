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

        // 배정 시도 알림
        if (lotId) {
            this.eventsGateway.broadcastLog(lotId, `${logPrefix} 배정 요청 접수`, 'INFO');
        }

        return this.dataSource.transaction(async manager => {
            const spaceRepo = manager.getRepository(ParkingSpace);
            const vehicleRepo = manager.getRepository(Vehicle);
            const assignmentLogRepo = manager.getRepository(AssignmentLog);
            const parkingLogRepo = manager.getRepository(ParkingLog);

            // 1. 차량 조회 또는 생성
            let vehicle = await vehicleRepo.findOne({ where: { plateNumber } });
            if (!vehicle) {
                vehicle = vehicleRepo.create({ plateNumber, type });
                await vehicleRepo.save(vehicle);
            }

            // 2. 가용 주차면 조회
            // 주차장 ID로 필터링
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
                // 장애인 차량 제외하고 일반 주차면으로 대체 조회
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

            // 3. 주차면 예약
            space.status = SpaceStatus.RESERVED;
            space.currentVehicleId = vehicle.id;
            await spaceRepo.save(space);

            // 4. 배정 로그 생성
            const assignmentLog = assignmentLogRepo.create({
                space,
                vehicle,
                reason: 'ENTRY_ASSIGNMENT',
            });
            await assignmentLogRepo.save(assignmentLog);

            // 5. 주차 로그 생성 (입차 시간)
            const parkingLog = parkingLogRepo.create({
                parkingSpace: space,
                vehicle,
                entryTime: new Date(),
                status: 'ASSIGNED', // 배정됨 상태
            });
            await parkingLogRepo.save(parkingLog);

            console.log(`[${txId}] Car-${plateNumber} 배정 완료 (Commit & Lock 해제) -> ${space.spaceCode}`);
            if (lotId) {
                this.eventsGateway.broadcastLog(lotId, `${logPrefix} 배정 완료 (Commit & Lock 해제) -> ${space.spaceCode}`, 'SUCCESS');
            }

            // 6. 상태 변경 알림
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

        // ID로 먼저 조회
        let targetSpace = await this.spaceRepository.findOne({
            where: { id: spaceIdentifier },
            relations: ['zone', 'zone.parkingLot']
        });

        // ID로 찾았으나 주차장 ID가 다르면 거부
        if (targetSpace && lotId && targetSpace.zone?.parkingLot?.id !== lotId) {
            throw new BadRequestException(`Space ${targetSpace.spaceCode} belongs to a different parking lot.`);
        }

        // ID로 못 찾으면 코드로 조회
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

        // 자리 충돌
        if (targetSpace.status === SpaceStatus.RESERVED && targetSpace.currentVehicleId !== vehicle.id) {
            const victimVehicleId = targetSpace.currentVehicleId;
            if (victimVehicleId) {
                victimVehicle = await this.vehicleRepository.findOne({ where: { id: victimVehicleId } });

                // [SPOT_THEFT] 즉시 에러 로그 기록
                if (victimVehicle) {
                    console.warn(`[ErrorLog] SPOT_THEFT: Space assigned to ${victimVehicle.plateNumber} but occupied by ${vehicle.plateNumber}.`);

                    // 피해 차량의 배정 로그 조회
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

        // 다른 주차면에 할당된 정보 제거
        await this.clearVehicleFromSpaces(vehicle.id, targetSpace.id);

        // 주차면 점유 처리
        targetSpace.status = SpaceStatus.OCCUPIED;
        targetSpace.currentVehicleId = vehicle.id;
        await this.spaceRepository.save(targetSpace);

        // 점유 후 피해 차량 재배정
        if (victimVehicle) {
            try {
                console.log(`Reassigning victim ${victimVehicle.plateNumber} from ${targetSpace.spaceCode}`);

                // 같은 주차장 내에서 재배정
                const currentLotId = targetSpace.zone?.parkingLot?.id || lotId;

                await this.reassignVehicle(victimVehicle, currentLotId);
            } catch (e) {
                console.error('Failed to reassign victim:', e);
            }
        }

        // 주차 로그 업데이트 (배정 상태 찾기)
        let parkingLog = await this.parkingLogRepository.findOne({
            where: { vehicle: { id: vehicle.id }, status: 'ASSIGNED' },
            order: { entryTime: 'DESC' }
        });

        if (parkingLog) {
            parkingLog.status = 'PARKED';
            parkingLog.parkingSpace = targetSpace; // 배정된 곳과 다른 곳에 주차했을 경우 업데이트
            await this.parkingLogRepository.save(parkingLog);
        } else {
            // 배정 로그가 없는 경우 (예외 상황)
            parkingLog = this.parkingLogRepository.create({
                parkingSpace: targetSpace,
                vehicle,
                entryTime: new Date(),
                status: 'PARKED',
            });
            await this.parkingLogRepository.save(parkingLog);
        }

        // 상태 변경 알림
        await this.broadcastSpaceUpdate(targetSpace, 'OCCUPIED', vehicle.plateNumber, `${targetSpace.spaceCode}: ${vehicle.plateNumber} 주차 완료`);

        // 센서 이벤트 처리 (에러 감지)
        await this.processSensorEvent(targetSpace.id, 'OCCUPIED');

        // 배정 로그 상태 완료로 변경
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
            // 출차 시간은 결제 시 설정됨
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
                    spaceCode: space.spaceCode, // 프론트엔드 매칭용 코드
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
        // 현재 배정된 차량만 조회 (예약 또는 점유)
        // 주차장 ID가 있으면 해당 주차장만 필터링
        const whereCondition: any = { currentVehicleId: Not(IsNull()) };

        if (lotId) {
            whereCondition.zone = { parkingLot: { id: lotId } };
        }

        const spaces = await this.spaceRepository.find({
            where: whereCondition,
            relations: ['vehicle', 'zone', 'zone.parkingLot'],
            order: { spaceCode: 'ASC' }
        });

        // null 필터링 및 차량 매핑
        const vehicles = spaces
            .map(space => space.vehicle)
            .filter(vehicle => vehicle !== null && vehicle !== undefined);

        // 중복 제거
        const uniqueVehicles = Array.from(new Map(vehicles.map(v => [v.id, v])).values());

        return uniqueVehicles.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));
    }
    async closeSpot(spaceId: string): Promise<any> {
        const space = await this.spaceRepository.findOne({ where: { id: spaceId }, relations: ['zone', 'zone.parkingLot'] });
        if (!space) throw new NotFoundException('Space not found');

        if (space.status === SpaceStatus.CLOSED) return { message: 'Space already closed' };

        const currentVehicleId = space.currentVehicleId;

        // 1. 먼저 현재 주차면을 폐쇄 상태로 변경하고 차량 정보를 제거 (유니크 제약 조건 회피)
        space.status = SpaceStatus.CLOSED;
        space.currentVehicleId = null;
        await this.spaceRepository.save(space);
        await this.broadcastSpaceUpdate(space, 'CLOSED', null, `${space.spaceCode} 폐쇄됨`);

        // 2. 배정된 차량이 있었다면 재배정 수행
        if (currentVehicleId) {
            const vehicle = await this.vehicleRepository.findOne({ where: { id: currentVehicleId } });
            if (vehicle) {
                console.log(`[CloseSpot] Reassigning vehicle ${vehicle.plateNumber} from closed space ${space.spaceCode}`);
                await this.reassignVehicle(vehicle, space.zone?.parkingLot?.id);
            }
        }

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

        // 새 주차면 찾기
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

            // 1. 기존 배정 취소
            const oldAssignment = await this.assignmentLogRepository.findOne({
                where: { vehicle: { id: vehicle.id }, status: AssignmentStatus.ACTIVE },
                order: { assignedAt: 'DESC' }
            });
            if (oldAssignment) {
                oldAssignment.status = AssignmentStatus.CANCELLED;
                await this.assignmentLogRepository.save(oldAssignment);
            }

            // 2. 새 주차면 예약
            space.status = SpaceStatus.RESERVED;
            space.currentVehicleId = vehicle.id;
            await this.spaceRepository.save(space);

            // 3. 새 배정 생성
            const assignmentLog = this.assignmentLogRepository.create({
                space,
                vehicle,
                reason: 'REASSIGNMENT_CONFLICT',
                status: AssignmentStatus.ACTIVE
            });
            await this.assignmentLogRepository.save(assignmentLog);

            // 4. 주차 로그 업데이트
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

            // 재배정 실패 시 출차 처리
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

        // 1. 물리적 상태 조회 (주차 로그 - 실제 주차된 차량)
        const parkingLog = await this.parkingLogRepository.findOne({
            where: { parkingSpace: { id: spaceId }, exitTime: IsNull() },
            relations: ['vehicle'],
            order: { entryTime: 'DESC' }
        });

        // 2. 논리적 계획 조회 (배정 로그 - 여기 있어야 할 차량)
        // 최신 배정 조회
        const latestAssignment = await this.assignmentLogRepository.findOne({
            where: { space: { id: spaceId } },
            order: { assignedAt: 'DESC' },
            relations: ['vehicle']
        });

        let errorType = '';
        let description = '';
        let shouldLog = false;

        // Case 1: 무단 점유
        // 조건: 점유됨 AND (배정 없음 OR 최신 배정이 활성 상태 아님)
        // 예외: 최신 배정이 취소된 경우(재배정 직후)는 무시
        if (sensorState === 'OCCUPIED' && parkingLog) {
            if (!latestAssignment || (latestAssignment.status !== AssignmentStatus.ACTIVE && latestAssignment.status !== AssignmentStatus.CANCELLED)) {
                errorType = 'UNAUTHORIZED_OCCUPANCY';
                description = `Vehicle ${parkingLog.vehicle.plateNumber} parked without active assignment.`;
                shouldLog = true;
            }
        }

        // Case 2: 자리 뺏김 -> occupySpace로 이동됨 (경쟁 조건 해결)
        // 중복 방지를 위해 여기서는 체크하지 않음

        // Case 3: 노쇼
        // 조건: 비어있음 AND 활성 배정 있음 AND 10분 경과
        if (sensorState === 'EMPTY' && !parkingLog && latestAssignment && latestAssignment.status === AssignmentStatus.ACTIVE) {
            const timeoutMs = 10 * 60 * 1000;
            const timeSinceAssignment = detectedAt.getTime() - latestAssignment.assignedAt.getTime();

            if (timeSinceAssignment > timeoutMs) {
                errorType = 'ASSIGNMENT_EXPIRED';
                description = `Vehicle ${latestAssignment.vehicle.plateNumber} failed to park within 10 minutes.`;
                shouldLog = true;

                // 중복 로그 방지를 위해 만료 처리
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
