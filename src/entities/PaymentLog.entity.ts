import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, Index } from 'typeorm';
import { ParkingLog } from './ParkingLog.entity';
import { FeePolicy } from './FeePolicy.entity';
import { AppliedDiscount } from './AppliedDiscount.entity';

@Entity()
export class PaymentLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => ParkingLog)
    parkingLog: ParkingLog;

    @ManyToOne(() => FeePolicy)
    feePolicy: FeePolicy;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    originalAmount: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    discountAmount: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    finalAmount: number;

    @Column()
    paymentMethod: string;

    @Index()
    @CreateDateColumn()
    paidAt: Date;

    @Column({ unique: true })
    receiptNo: string;

    @OneToMany(() => AppliedDiscount, (appliedDiscount) => appliedDiscount.paymentLog)
    appliedDiscounts: AppliedDiscount[];
}
