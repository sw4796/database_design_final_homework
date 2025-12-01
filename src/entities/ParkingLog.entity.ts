import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { ParkingSpace } from './ParkingSpace.entity';
import { Vehicle } from './Vehicle.entity';

@Entity()
export class ParkingLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @CreateDateColumn()
    entryTime: Date;

    @Column({ nullable: true })
    exitTime: Date;

    @ManyToOne(() => ParkingSpace)
    space: ParkingSpace;

    @ManyToOne(() => Vehicle)
    vehicle: Vehicle;

    @Column({ default: 'PARKED' })
    status: string; // PARKED, PAID, EXITED
}
