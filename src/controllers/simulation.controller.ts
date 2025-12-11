import { Controller, Post, Body } from '@nestjs/common';
import { ParkingService } from '../services/parking.service';
import { VehicleType } from '../entities/Vehicle.entity';

@Controller('simulation')
export class SimulationController {
    constructor(private readonly parkingService: ParkingService) { }

    @Post('enter')
    async enter(@Body() body: { plateNumber: string; type: VehicleType; lotId?: string }) {
        return this.parkingService.assignSpace(body.plateNumber, body.type, body.lotId);
    }

    @Post('park')
    async park(@Body() body: { plateNumber: string; targetSpaceId: string; lotId?: string }) {
        return this.parkingService.occupySpace(body.plateNumber, body.targetSpaceId, body.lotId);
    }

    @Post('exit')
    async exit(@Body() body: { plateNumber: string }) {
        return this.parkingService.exitVehicle(body.plateNumber);
    }
}
