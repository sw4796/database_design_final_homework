import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { ParkingSpace } from './ParkingSpace.entity';
import { Vehicle } from './Vehicle.entity';

export enum AssignmentStatus {
    ACTIVE = 'ACTIVE',
    COMPLETED = 'COMPLETED',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED',
}

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

    @Column({
        type: 'enum',
        enum: AssignmentStatus,
        default: AssignmentStatus.ACTIVE
    })
    status: AssignmentStatus;
}
