import { Controller, Get, Post, Body, Param, NotFoundException, Query, Patch, Delete } from '@nestjs/common';
import { UserService } from '../services/user.service';
import { User } from '../entities/User.entity';

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Get()
    async findAll(@Query('name') name?: string): Promise<User[]> {
        return this.userService.findAll(name);
    }

    @Get('me')
    async getMe(): Promise<User> {
        return this.userService.getMe();
    }

    @Get(':id')

    async findOne(@Param('id') id: string): Promise<User> {
        const user = await this.userService.findOne(id);
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        return user;
    }

    @Post()
    async create(@Body() user: Partial<User>): Promise<User> {
        return this.userService.create(user);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() user: Partial<User>): Promise<User> {
        return this.userService.update(id, user);
    }

    @Delete(':id')
    async remove(@Param('id') id: string): Promise<void> {
        return this.userService.remove(id);
    }
}
