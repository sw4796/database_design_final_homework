import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ParkingZone } from './ParkingZone.entity';

export enum SpaceType {
    GENERAL = 'GENERAL',
    COMPACT = 'COMPACT',
    DISABLED = 'DISABLED',
    EV = 'EV',
}

export enum SpaceStatus {
    EMPTY = 'EMPTY',
    OCCUPIED = 'OCCUPIED',
    RESERVED = 'RESERVED',
}

@Entity()
export class ParkingSpace {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    spaceCode: string; // e.g., "A-01"

    @Column({
        type: 'enum',
        enum: SpaceType,
        default: SpaceType.GENERAL,
    })
    type: SpaceType;

    @Column({
        type: 'enum',
        enum: SpaceStatus,
        default: SpaceStatus.EMPTY,
    })
    status: SpaceStatus;

    @Column({ type: 'varchar', nullable: true })
    currentVehicleId: string | null; // For simulation simplicity, storing vehicle ID directly if needed

    @ManyToOne(() => ParkingZone, (zone) => zone.spaces)
    zone: ParkingZone;
}
