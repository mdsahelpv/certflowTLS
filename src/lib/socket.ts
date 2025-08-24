import { Server } from 'socket.io';
import { logger } from './logger';

export const setupSocket = (io: Server) => {
  io.on('connection', (socket) => {
    logger.socket.info('Client connected', {
      socketId: socket.id,
      remoteAddress: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent']
    });
    
    // Handle messages
    socket.on('message', (msg: { text: string; senderId: string }) => {
      logger.socket.debug('Received message', {
        socketId: socket.id,
        senderId: msg.senderId,
        messageLength: msg.text.length
      });
      
      // Echo: broadcast message only the client who send the message
      socket.emit('message', {
        text: `Echo: ${msg.text}`,
        senderId: 'system',
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.socket.info('Client disconnected', {
        socketId: socket.id,
        reason
      });
    });

    // Send welcome message
    socket.emit('message', {
      text: 'Welcome to WebSocket Echo Server!',
      senderId: 'system',
      timestamp: new Date().toISOString(),
    });
  });
};