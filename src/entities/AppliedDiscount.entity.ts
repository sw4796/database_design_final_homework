import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { DiscountRule } from './DiscountRule.entity';
import { PaymentLog } from './PaymentLog.entity';

@Entity()
export class AppliedDiscount {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => DiscountRule)
    discountRule: DiscountRule;

    @ManyToOne(() => PaymentLog, (paymentLog) => paymentLog.appliedDiscounts)
    paymentLog: PaymentLog;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    appliedAmount: number;

    @Column({ nullable: true })
    description: string;
}
