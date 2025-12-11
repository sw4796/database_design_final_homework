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

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    maxFee: number;

    @Column({ default: () => 'CURRENT_TIMESTAMP' })
    validFrom: Date;

    @Column({ default: '2099-12-31 23:59:59' })
    validTo: Date;

    @ManyToOne(() => ParkingLot)
    parkingLot: ParkingLot;

    @Column({ default: false })
    isDeleted: boolean;
}
