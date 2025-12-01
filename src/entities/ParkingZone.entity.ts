import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { ParkingLot } from './ParkingLot.entity';
import { ParkingSpace } from './ParkingSpace.entity';

@Entity()
export class ParkingZone {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    floor: number;

    @ManyToOne(() => ParkingLot, (lot) => lot.zones)
    parkingLot: ParkingLot;

    @OneToMany(() => ParkingSpace, (space) => space.zone)
    spaces: ParkingSpace[];
}
