import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from '../entities/User.entity';

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

    async findAll(name?: string): Promise<User[]> {
        if (name) {
            return this.userRepository.find({
                where: [
                    { name: Like(`%${name}%`) }
                ]
            });
        }
        return this.userRepository.find();
    }

    async findOne(id: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { id } });
    }

    async create(user: Partial<User>): Promise<User> {
        const newUser = this.userRepository.create(user);
        return this.userRepository.save(newUser);
    }

    async getMe(): Promise<User> {
        // For simulation purposes, we'll return the first user or create a default one
        const users = await this.userRepository.find({ take: 1 });
        if (users.length > 0) {
            return users[0];
        }

        // Create default user if none exists
        const defaultUser = this.userRepository.create({
            name: '홍길동',
            phone: '010-1234-5678',
            email: 'hong@example.com',
            grade: 'GOLD',
        });
        return this.userRepository.save(defaultUser);
    }
}
