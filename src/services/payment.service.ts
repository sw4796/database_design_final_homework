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
        private dataSource: DataSource,
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
        // 1. Find Active Parking Log
        const parkingLog = await this.parkingLogRepository.findOne({
            where: {
                vehicle: { plateNumber },
                exitTime: IsNull(), // Still parked
            },
            relations: ['vehicle', 'parkingSpace', 'parkingSpace.zone', 'parkingSpace.zone.parkingLot'],
            order: { entryTime: 'DESC' }
        });

        if (!parkingLog) {
            throw new NotFoundException('Vehicle not found or not parked');
        }

        const parkingLot = parkingLog.parkingSpace.zone.parkingLot;

        // 2. Calculate Fee
        const feePolicy = await this.feePolicyRepository.findOne({
            where: { parkingLot: { id: parkingLot.id } }
        });

        if (!feePolicy) {
            throw new NotFoundException('Fee policy not found');
        }

        const now = new Date();
        const durationMinutes = Math.floor((now.getTime() - parkingLog.entryTime.getTime()) / 60000);
        const originalFee = await this.calculateFee(parkingLog.entryTime, now, feePolicy);

        // 3. Apply Discounts (Simulation)
        let discountAmount = 0;
        let finalFee = originalFee;
        let appliedDiscountsDetails: { description: string, amount: number }[] = [];

        if (userId) {
            try {
                const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
                if (user) {
                    const discountRules = await this.discountRuleRepository.find({ where: { parkingLot: { id: parkingLot.id } } });

                    // Get Purchase History for today (simplified)
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
                                amount: discount
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

    async processPayment(parkingLogId: string, userId: string | null, paymentMethod: string): Promise<PaymentLog> {
        return this.dataSource.transaction(async manager => {
            const parkingLog = await manager.findOne(ParkingLog, { where: { id: parkingLogId }, relations: ['parkingSpace', 'parkingSpace.zone', 'parkingSpace.zone.parkingLot'] });
            if (!parkingLog) throw new NotFoundException('Parking log not found');

            if (parkingLog.status === 'PAID') throw new BadRequestException('Already paid');

            const parkingLotId = parkingLog.parkingSpace.zone.parkingLot.id;
            const now = new Date();

            // 1. Get Fee Policy
            const feePolicy = await manager.findOne(FeePolicy, { where: { parkingLot: { id: parkingLotId } } });
            if (!feePolicy) throw new NotFoundException('Fee policy not found');

            // 2. Calculate Base Fee
            const originalAmount = await this.calculateFee(parkingLog.entryTime, now, feePolicy);

            // 3. Apply Discounts
            let discountAmount = 0;
            const appliedDiscountsToSave: AppliedDiscount[] = [];

            if (userId) {
                const user = await manager.findOne(User, { where: { id: userId } });
                const discountRules = await manager.find(DiscountRule, { where: { parkingLot: { id: parkingLotId } } });

                const startOfDay = new Date(now.setHours(0, 0, 0, 0));
                const purchases = await manager.createQueryBuilder(PurchaseHistory, 'ph')
                    .where('ph.userId = :userId', { userId })
                    .andWhere('ph.parkingLotId = :parkingLotId', { parkingLotId })
                    .andWhere('ph.purchaseTime >= :startOfDay', { startOfDay })
                    .getMany();

                const totalPurchaseAmount = purchases.reduce((sum, p) => sum + Number(p.amount), 0);

                const applicableDiscounts = await this.getApplicableDiscounts(user!, totalPurchaseAmount, discountRules);

                for (const { rule } of applicableDiscounts) {
                    let discount = 0;
                    if (rule.discountRate > 0) {
                        discount = originalAmount * (rule.discountRate / 100);
                    } else if (rule.discountAmount > 0) {
                        discount = rule.discountAmount;
                    }

                    if (discount > 0) {
                        discountAmount += discount;
                        const applied = new AppliedDiscount();
                        applied.discountRule = rule;
                        applied.appliedAmount = discount;
                        applied.description = rule.name;
                        appliedDiscountsToSave.push(applied);
                    }
                }

                discountAmount = Math.min(discountAmount, originalAmount);
            }

            const finalAmount = originalAmount - discountAmount;

            // 4. Create Payment Log
            const paymentLog = new PaymentLog();
            paymentLog.parkingLog = parkingLog;
            paymentLog.feePolicy = feePolicy;
            paymentLog.originalAmount = originalAmount;
            paymentLog.discountAmount = discountAmount;
            paymentLog.finalAmount = finalAmount;
            paymentLog.paymentMethod = paymentMethod;
            paymentLog.paidAt = new Date();
            paymentLog.receiptNo = `RCPT-${Date.now()}`;

            const savedPaymentLog = await manager.save(PaymentLog, paymentLog);

            // 5. Save Applied Discounts
            for (const applied of appliedDiscountsToSave) {
                applied.paymentLog = savedPaymentLog;
                await manager.save(AppliedDiscount, applied);
            }

            // 6. Update Parking Log Status
            parkingLog.status = 'PAID';
            parkingLog.exitTime = new Date();
            await manager.save(ParkingLog, parkingLog);

            return savedPaymentLog;
        });
    }

    async getReceipts(filters: { userId?: string, receiptNo?: string, includeNonMembers?: boolean }): Promise<PaymentLog[]> {
        const query = this.paymentLogRepository.createQueryBuilder('pl')
            .leftJoinAndSelect('pl.parkingLog', 'pLog')
            .leftJoinAndSelect('pLog.vehicle', 'vehicle')
            .leftJoinAndSelect('vehicle.user', 'user')
            .leftJoinAndSelect('pl.appliedDiscounts', 'ad')
            .leftJoinAndSelect('ad.discountRule', 'dr')
            .orderBy('pl.paidAt', 'DESC');

        if (filters.receiptNo) {
            query.andWhere('pl.receiptNo LIKE :receiptNo', { receiptNo: `%${filters.receiptNo}%` });
        }

        if (filters.userId) {
            if (filters.userId === 'NON_MEMBER') {
                query.andWhere('vehicle.user IS NULL');
            } else {
                query.andWhere('user.id = :userId', { userId: filters.userId });
            }
        }

        return query.getMany();
    }

    async getPayableVehicles(lotId: string): Promise<any[]> {
        // Find all parking logs that are NOT PAID (i.e., PARKED or EXITED but not settled)
        // filtered by the specific parking lot.
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

        // We might have multiple logs for the same vehicle if there are old unpaid ones (though unlikely in this flow).
        // But let's deduplicate by vehicle ID, preferring the most recent one.
        const vehicleMap = new Map<string, any>();

        for (const log of logs) {
            if (!vehicleMap.has(log.vehicle.id)) {
                vehicleMap.set(log.vehicle.id, {
                    ...log.vehicle,
                    // Attach the log status so frontend knows if it's exited or parked
                    parkingStatus: log.status,
                    parkingLogId: log.id
                });
            }
        }

        return Array.from(vehicleMap.values());
    }
}
