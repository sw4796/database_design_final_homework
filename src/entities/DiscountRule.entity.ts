import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ParkingLot } from './ParkingLot.entity';

@Entity()
export class DiscountRule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    targetType: string; // USER_GRADE, PURCHASE_AMOUNT

    @Column({ nullable: true })
    grade: string;

    @Column({ nullable: true })
    minPurchaseAmount: number;

    @Column({ type: 'float', default: 0 })
    discountRate: number;

    @Column({ default: 0 })
    discountAmount: number;

    @ManyToOne(() => ParkingLot)
    parkingLot: ParkingLot;

    @Column({ default: false })
    isDeleted: boolean;
}
