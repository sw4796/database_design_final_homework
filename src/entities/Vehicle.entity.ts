import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from './User.entity';

export enum VehicleType {
    COMPACT = 'COMPACT',
    MIDSIZE = 'MIDSIZE',
    LARGE = 'LARGE',
    DISABLED = 'DISABLED',
    EV = 'EV',
}

@Entity()
export class Vehicle {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    plateNumber: string;

    @Column({
        type: 'enum',
        enum: VehicleType,
        default: VehicleType.MIDSIZE,
    })
    type: VehicleType;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => User, (user) => user.vehicles, { nullable: true })
    user: User;
}
