import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { ParkingZone } from './ParkingZone.entity';

@Entity()
export class ParkingLot {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    address: string;

    @OneToMany(() => ParkingZone, (zone) => zone.parkingLot)
    zones: ParkingZone[];
}
