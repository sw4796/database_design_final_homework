import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { ParkingSpace } from './ParkingSpace.entity';
import { Vehicle } from './Vehicle.entity';

@Entity()
export class AssignmentLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @CreateDateColumn()
    assignedAt: Date;

    @ManyToOne(() => ParkingSpace)
    space: ParkingSpace;

    @ManyToOne(() => Vehicle)
    vehicle: Vehicle;

    @Column()
    reason: string; // e.g., "INITIAL_ENTRY", "REASSIGNMENT"
}
