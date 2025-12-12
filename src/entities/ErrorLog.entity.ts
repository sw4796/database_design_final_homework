import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { ParkingSpace } from './ParkingSpace.entity';
import { ParkingLog } from './ParkingLog.entity';
import { AssignmentLog } from './AssignmentLog.entity';

@Entity()
export class ErrorLog {
    @PrimaryGeneratedColumn('uuid')
    id: string; // error_id

    @ManyToOne(() => ParkingSpace)
    space: ParkingSpace;

    @ManyToOne(() => ParkingLog, { nullable: true })
    parkingLog: ParkingLog;

    @ManyToOne(() => AssignmentLog, { nullable: true })
    assignmentLog: AssignmentLog;

    @Column()
    sensorState: string; // e.g., 'OCCUPIED'

    @Column()
    dbState: string; // e.g., 'EMPTY'

    @Column()
    errorType: string; // e.g., 'STATE_MISMATCH'

    @CreateDateColumn()
    detectedAt: Date;

    @Column({ type: 'text', nullable: true })
    description: string;
}
