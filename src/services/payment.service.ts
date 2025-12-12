import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, MoreThanOrEqual, Not } from 'typeorm';
import { ParkingLog } from '../entities/ParkingLog.entity';
import { PaymentLog } from '../entities/PaymentLog.entity';
import { FeePolicy } from '../entities/FeePolicy.entity';
import { DiscountRule } from '../entities/DiscountRule.entity';
import { AppliedDiscount } from '../entities/AppliedDiscount.entity';
import { User } from '../entities/User.entity';
import { PurchaseHistory } from '../entities/PurchaseHistory.entity';
import { ParkingLot } from '../entities/ParkingLot.entity';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class PaymentService {
    constructor(
        @InjectRepository(ParkingLog)
        private parkingLogRepository: Repository<ParkingLog>,
        @InjectRepository(PaymentLog)
        private paymentLogRepository: Repository<PaymentLog>,
        @InjectRepository(FeePolicy)
        private feePolicyRepository: Repository<FeePolicy>,
        @InjectRepository(DiscountRule)
        private discountRuleRepository: Repository<DiscountRule>,
        @InjectRepository(AppliedDiscount)
        private appliedDiscountRepository: Repository<AppliedDiscount>,
        @InjectRepository(PurchaseHistory)
        private purchaseHistoryRepository: Repository<PurchaseHistory>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private dataSource: DataSource,
        private eventsGateway: EventsGateway,
    ) { }

    async calculateFee(entryTime: Date, exitTime: Date, feePolicy: FeePolicy): Promise<number> {
        const durationMin = Math.ceil((exitTime.getTime() - entryTime.getTime()) / (1000 * 60));

        if (durationMin <= feePolicy.baseTimeMin) {
            return feePolicy.baseFee;
        }

        const extraTime = durationMin - feePolicy.baseTimeMin;
        const extraUnits = Math.ceil(extraTime / feePolicy.unitTimeMin);
        const fee = feePolicy.baseFee + (extraUnits * feePolicy.unitFee);

        return Math.min(fee, feePolicy.maxFee);
    }

    async getApplicableDiscounts(user: User, purchaseAmount: number, discountRules: DiscountRule[]): Promise<{ rule: DiscountRule, amount: number }[]> {
        const applicableDiscounts: { rule: DiscountRule, amount: number }[] = [];

        for (const rule of discountRules) {
            let isApplicable = false;

            if (rule.targetType === 'USER_GRADE') {
                if (user && user.grade === rule.grade) {
                    isApplicable = true;
                }
            } else if (rule.targetType === 'PURCHASE_AMOUNT') {
                if (purchaseAmount >= rule.minPurchaseAmount) {
                    isApplicable = true;
                }
            }

            if (isApplicable) {
                applicableDiscounts.push({ rule, amount: 0 });
            }
        }
        return applicableDiscounts;
    }

    async previewFee(plateNumber: string, userId?: string): Promise<any> {
        // 1. 활성 주차 로그 조회
        const parkingLog = await this.parkingLogRepository.findOne({
            where: {
                vehicle: { plateNumber },
                exitTime: IsNull(), // 주차 중
            },
            relations: ['vehicle', 'parkingSpace', 'parkingSpace.zone', 'parkingSpace.zone.parkingLot'],
            order: { entryTime: 'DESC' }
        });

        if (!parkingLog) {
            throw new NotFoundException('Vehicle not found or not parked');
        }

        const parkingLot = parkingLog.parkingSpace.zone.parkingLot;

        // 2. 요금 계산
        const feePolicy = await this.feePolicyRepository.findOne({
            where: { parkingLot: { id: parkingLot.id } }
        });

        if (!feePolicy) {
            throw new NotFoundException('Fee policy not found');
        }

        const now = new Date();
        const durationMinutes = Math.floor((now.getTime() - parkingLog.entryTime.getTime()) / 60000);
        const originalFee = await this.calculateFee(parkingLog.entryTime, now, feePolicy);

        // 3. 할인 적용 (시뮬레이션)
        let discountAmount = 0;
        let finalFee = originalFee;
        let appliedDiscountsDetails: { description: string, amount: number, rate?: number }[] = [];

        if (userId) {
            try {
                const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
                if (user) {
                    const discountRules = await this.discountRuleRepository.find({ where: { parkingLot: { id: parkingLot.id } } });

                    // 오늘 구매 내역 조회
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const purchases = await this.purchaseHistoryRepository.find({
                        where: {
                            user: { id: userId },
                            parkingLot: { id: parkingLot.id },
                            purchaseTime: MoreThanOrEqual(today)
                        }
                    });

                    const totalPurchaseAmount = purchases.reduce((sum, p) => sum + Number(p.amount), 0);

                    const applicableDiscounts = await this.getApplicableDiscounts(user, totalPurchaseAmount, discountRules);

                    for (const { rule } of applicableDiscounts) {
                        if (finalFee <= 0) break;

                        let discount = 0;
                        if (rule.discountRate > 0) {
                            discount = originalFee * (rule.discountRate / 100);
                        } else if (rule.discountAmount > 0) {
                            discount = rule.discountAmount;
                        }

                        if (discount > 0) {
                            discountAmount += discount;
                            appliedDiscountsDetails.push({
                                description: rule.name,
                                amount: discount,
                                rate: rule.discountRate // Add rate info
                            });
                        }
                    }

                    discountAmount = Math.min(discountAmount, originalFee);
                    finalFee = originalFee - discountAmount;
                }
            } catch (err: any) {
                console.error('[PreviewFee] User logic error:', err);
                throw new BadRequestException(`User logic error: ${err.message}`);
            }
        }

        return {
            parkingLogId: parkingLog.id,
            plateNumber: parkingLog.vehicle.plateNumber,
            entryTime: parkingLog.entryTime,
            duration: durationMinutes,
            originalAmount: originalFee,
            discountAmount: discountAmount,
            finalAmount: finalFee,
            discounts: appliedDiscountsDetails
        };
    }

    private activeTransactions = new Map<string, boolean>();

    async cancelTransaction(transactionId: string) {
        if (this.activeTransactions.has(transactionId)) {
            this.activeTransactions.set(transactionId, true);
            console.log(`[Transaction] Cancel requested for ${transactionId}`);
        }
    }

    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private checkCancellation(transactionId: string) {
        if (this.activeTransactions.get(transactionId)) {
            throw new Error('Transaction Cancelled by User');
        }
    }

    async pay(parkingLogId: string, amount: number, paymentMethod: string, discountAmount: number = 0, forceFail: boolean = false, transactionId?: string, userId?: string | null): Promise<PaymentLog> {
        if (transactionId) {
            this.activeTransactions.set(transactionId, false);
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        let lotId: string | null = null;

        try {
            const parkingLog = await queryRunner.manager.findOne(ParkingLog, {
                where: { id: parkingLogId },
                relations: ['vehicle', 'parkingSpace', 'parkingSpace.zone', 'parkingSpace.zone.parkingLot']
            });

            if (!parkingLog) {
                throw new NotFoundException('Parking log not found');
            }

            lotId = parkingLog.parkingSpace.zone.parkingLot.id;

            if (parkingLog.status === 'PAID') {
                throw new BadRequestException('Already paid');
            }

            // 1단계: 결제 로그 생성
            if (transactionId && lotId) {
                this.eventsGateway.broadcastLog(lotId, '결제 로그 생성 중...', 'INFO');
                await this.sleep(2000);
                this.checkCancellation(transactionId);
            }

            const logMsg1 = `[DB] PAYMENT_LOG Inserted... (Amount: ${amount})`;
            console.log(logMsg1);
            if (transactionId && lotId) {
                this.eventsGateway.broadcastLog(lotId, logMsg1, 'INFO');
            }
            const paymentLog = queryRunner.manager.create(PaymentLog, {
                paymentTime: new Date(),
                amount: amount,
                paymentMethod: paymentMethod,
                parkingLog: parkingLog,
                receiptNo: `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                originalAmount: amount + discountAmount,
                discountAmount: discountAmount,
                finalAmount: amount,
                feePolicy: undefined
            });
            await queryRunner.manager.save(paymentLog);

            // 2단계: 주차 로그 상태 업데이트
            if (transactionId && lotId) {
                this.eventsGateway.broadcastLog(lotId, '주차 상태 변경 중 (PAID)...', 'INFO');
                await this.sleep(2000);
                this.checkCancellation(transactionId);
            }

            // Explicitly update status and exitTime using update() to avoid object state issues
            await queryRunner.manager.update(ParkingLog, parkingLog.id, {
                status: 'PAID',
                exitTime: new Date()
            });

            // 3단계: 적용된 할인 저장
            if (transactionId && lotId) {
                this.eventsGateway.broadcastLog(lotId, '할인 내역 저장 중...', 'INFO');
                await this.sleep(2000);
                this.checkCancellation(transactionId);
            }

            if (discountAmount > 0) {
                const logMsg2 = `[DB] APPLIED_DISCOUNT Inserted... (Amount: ${discountAmount})`;
                console.log(logMsg2);
                if (transactionId && lotId) {
                    this.eventsGateway.broadcastLog(lotId, logMsg2, 'INFO');
                }

                const applied = new AppliedDiscount();
                applied.paymentLog = paymentLog;
                applied.appliedAmount = discountAmount;
                applied.description = '기본 할인'; // Placeholder
                await queryRunner.manager.save(AppliedDiscount, applied);
            }

            // 4단계: 사용자 연동
            if (transactionId && lotId) {
                this.eventsGateway.broadcastLog(lotId, '사용자 정보 연동 중...', 'INFO');
                await this.sleep(2000);
                this.checkCancellation(transactionId);
            }

            if (userId) {
                const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
                if (user) {
                    // Update user relation explicitly
                    await queryRunner.manager.update(ParkingLog, parkingLog.id, { user: user });

                    const logMsg3 = `[DB] User Linked to ParkingLog: ${user.name}`;
                    console.log(logMsg3);
                    if (transactionId && lotId) {
                        this.eventsGateway.broadcastLog(lotId, logMsg3, 'INFO');
                        await this.sleep(2000);
                        this.checkCancellation(transactionId);
                    }
                }
            }

            await queryRunner.commitTransaction();

            if (transactionId && lotId) {
                this.eventsGateway.broadcastLog(lotId, '결제 트랜잭션 완료', 'SUCCESS');
            }

            return paymentLog;

        } catch (err: any) {
            console.log('🔄 Transaction Rolling back...');
            if (transactionId && lotId) {
                this.eventsGateway.broadcastLog(lotId, `🚨 결제 실패: ${err.message}`, 'ERROR');
            }
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
            if (transactionId) {
                this.activeTransactions.delete(transactionId);
            }
        }
    }

    async getReceipts(filters: { userId?: string, receiptNo?: string, includeNonMembers?: boolean }): Promise<PaymentLog[]> {
        const query = this.paymentLogRepository.createQueryBuilder('pl')
            .leftJoinAndSelect('pl.parkingLog', 'pLog')
            .leftJoinAndSelect('pLog.vehicle', 'vehicle')
            .leftJoinAndSelect('pLog.user', 'user') // Join user from ParkingLog
            .leftJoinAndSelect('pl.appliedDiscounts', 'ad')
            .leftJoinAndSelect('ad.discountRule', 'dr')
            .orderBy('pl.paidAt', 'DESC');

        if (filters.receiptNo) {
            query.andWhere('pl.receiptNo LIKE :receiptNo', { receiptNo: `%${filters.receiptNo}%` });
        }

        if (filters.userId) {
            if (filters.userId === 'NON_MEMBER') {
                query.andWhere('user.id IS NULL'); // Check ParkingLog user
            } else {
                query.andWhere('user.id = :userId', { userId: filters.userId });
            }
        }

        return query.getMany();
    }

    async getPayableVehicles(lotId: string): Promise<any[]> {
        // 미결제 주차 로그 조회
        // 해당 주차장만 필터링
        const logs = await this.parkingLogRepository.find({
            where: {
                status: Not('PAID'),
                parkingSpace: {
                    zone: {
                        parkingLot: { id: lotId }
                    }
                }
            },
            relations: ['vehicle', 'parkingSpace', 'parkingSpace.zone', 'parkingSpace.zone.parkingLot'],
            order: { entryTime: 'DESC' }
        });

        // 중복 로그 제거 (최신 로그 우선)
        const vehicleMap = new Map<string, any>();

        for (const log of logs) {
            if (!vehicleMap.has(log.vehicle.id)) {
                vehicleMap.set(log.vehicle.id, {
                    ...log.vehicle,
                    // 로그 상태 포함 (출차 여부 확인용)
                    parkingStatus: log.status,
                    parkingLogId: log.id
                });
            }
        }

        return Array.from(vehicleMap.values());
    }
}
