import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { ParkingSpace } from './ParkingSpace.entity';
import { Vehicle } from './Vehicle.entity';
import { User } from './User.entity';

@Entity()
export class ParkingLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @CreateDateColumn()
    entryTime: Date;

    @Column({ nullable: true })
    exitTime: Date;

    @ManyToOne(() => ParkingSpace)
    @ManyToOne(() => ParkingSpace)
    parkingSpace: ParkingSpace;

    @ManyToOne(() => Vehicle)
    vehicle: Vehicle;

    @ManyToOne(() => User, { nullable: true })
    user: User;

    @Column({ default: 'PARKED' })
    status: string; // PARKED, PAID, EXITED
}
