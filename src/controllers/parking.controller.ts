import { Controller, Post, Body, Get } from '@nestjs/common';
import { ParkingService } from '../services/parking.service';
import { VehicleType } from '../entities/Vehicle.entity';

@Controller('parking')
export class ParkingController {
    constructor(private readonly parkingService: ParkingService) { }

    @Get('spaces')
    async getSpaces() {
        return this.parkingService.getAllSpaces();
    }

    @Post('enter')
    async enterVehicle(@Body() body: { plateNumber: string; type: VehicleType }) {
        return this.parkingService.enterVehicle(body.plateNumber, body.type);
    }
}
