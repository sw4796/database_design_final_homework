import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ParkingLot } from './ParkingLot.entity';
import { User } from './User.entity';

@Entity()
export class PurchaseHistory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => ParkingLot)
    parkingLot: ParkingLot;

    @ManyToOne(() => User, { nullable: true })
    user: User;

    @Column()
    purchaseTime: Date;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: number;

    @Column({ nullable: true })
    content: string;

    @Column()
    externalReceiptNo: string;
}
