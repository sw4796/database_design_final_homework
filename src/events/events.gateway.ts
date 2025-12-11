import {
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class EventsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private logger: Logger = new Logger('EventsGateway');

    afterInit(server: Server) {
        this.logger.log('Init');
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    handleConnection(client: Socket, ...args: any[]) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(client: Socket, payload: { lotId: string }): void {
        client.join(payload.lotId);
        this.logger.log(`Client ${client.id} joined room ${payload.lotId}`);
    }

    // Method to broadcast updates to a specific parking lot
    broadcastToLot(lotId: string, event: string, data: any) {
        this.server.to(lotId).emit(event, data);
    }

    broadcastLog(lotId: string, message: string, type: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO') {
        this.server.to(lotId).emit('simulationLog', {
            message,
            type,
            timestamp: new Date()
        });
    }
}
