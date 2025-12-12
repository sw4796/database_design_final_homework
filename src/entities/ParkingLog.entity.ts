import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { ParkingSpace } from './ParkingSpace.entity';
import { Vehicle } from './Vehicle.entity';
import { User } from './User.entity';

@Entity()
export class ParkingLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @CreateDateColumn()
    entryTime: Date;

    @Column({ nullable: true })
    exitTime: Date;

    @ManyToOne(() => ParkingSpace)
    parkingSpace: ParkingSpace;

    @Index('IDX_LOG_VEHICLE')
    @ManyToOne(() => Vehicle)
    vehicle: Vehicle;

    @ManyToOne(() => User, { nullable: true })
    user: User;

    @Index()
    @Column({ default: 'PARKED' })
    status: string; // PARKED, PAID, EXITED
}
