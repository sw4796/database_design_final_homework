import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, JoinColumn } from 'typeorm';
import { Vehicle, VehicleType } from './Vehicle.entity';
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
    CLOSED = 'CLOSED',
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

    @Column({ type: 'int', default: 0 })
    x: number;

    @Column({ type: 'int', default: 0 })
    y: number;

    @Column({ type: 'int', default: 60 })
    width: number;

    @Column({ type: 'int', default: 40 })
    height: number;

    @Column({ type: 'int', default: 0 })
    rotation: number;

    @Column({ type: 'varchar', nullable: true })
    currentVehicleId: string | null;

    @OneToOne(() => Vehicle)
    @JoinColumn({ name: 'currentVehicleId' })
    vehicle: Vehicle;

    @ManyToOne(() => ParkingZone, (zone) => zone.spaces)
    zone: ParkingZone;
}
