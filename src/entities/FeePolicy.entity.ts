import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ParkingLot } from './ParkingLot.entity';

@Entity()
export class FeePolicy {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    baseTimeMin: number;

    @Column()
    baseFee: number;

    @Column()
    unitTimeMin: number;

    @Column()
    unitFee: number;

    @ManyToOne(() => ParkingLot)
    parkingLot: ParkingLot;
}
