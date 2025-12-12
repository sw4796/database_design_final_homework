import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Check } from 'typeorm';
import { ParkingLot } from './ParkingLot.entity';

@Entity()
@Check(`"CHK_DISCOUNT_LOGIC"`, `(
    ("targetType" = 'USER_GRADE' AND "grade" IS NOT NULL) OR
    ("targetType" = 'PURCHASE_AMOUNT' AND "minPurchaseAmount" > 0) OR
    ("targetType" NOT IN ('USER_GRADE', 'PURCHASE_AMOUNT')) 
)`)
@Check(`"CHK_DISCOUNT_VALUE"`, `(
    ("discountRate" > 0 AND "discountAmount" = 0) OR
    ("discountRate" = 0 AND "discountAmount" > 0)
)`)
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
