import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { ParkingLog } from './ParkingLog.entity';

@Entity()
export class PaymentLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    amount: number;

    @Column()
    paymentMethod: string;

    @CreateDateColumn()
    paidAt: Date;

    @ManyToOne(() => ParkingLog)
    parkingLog: ParkingLog;
}
