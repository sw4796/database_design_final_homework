import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { ParkingService } from '../services/parking.service';
import { VehicleType } from '../entities/Vehicle.entity';

@Controller('parking')
export class ParkingController {
    constructor(private readonly parkingService: ParkingService) { }

    @Get('lots')
    async getLots() {
        return this.parkingService.getLots();
    }

    @Get('zones/:lotId')
    async getZones(@Param('lotId') lotId: string) {
        return this.parkingService.getZones(lotId);
    }

    @Get('spaces')
    async getSpaces(@Query('zoneId') zoneId?: string, @Query('lotId') lotId?: string) {
        if (zoneId) {
            return this.parkingService.getSpacesByZone(zoneId);
        }
        return this.parkingService.getAllSpaces(lotId);
    }

    @Get('vehicles')
    async getVehicles(@Query('lotId') lotId?: string) {
        return this.parkingService.getAllVehicles(lotId);
    }

    @Post('enter')
    async enterVehicle(@Body() body: { plateNumber: string; type: VehicleType; lotId?: string }) {
        return this.parkingService.enterVehicle(body.plateNumber, body.type, body.lotId);
    }

    @Post('close/:spaceId')
    async closeSpot(@Param('spaceId') spaceId: string) {
        return this.parkingService.closeSpot(spaceId);
    }

    @Post('open/:spaceId')
    async openSpot(@Param('spaceId') spaceId: string) {
        return this.parkingService.openSpot(spaceId);
    }
}
