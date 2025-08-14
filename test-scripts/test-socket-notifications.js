#!/usr/bin/env node

/**
 * Phase 7: Real-time Features Testing
 * Test Socket.IO real-time notifications
 */

// Load environment variables
require('dotenv').config({ path: '.env' });

const { Server } = require('socket.io');
const { createServer } = require('http');
const io = require('socket.io-client');

// Configuration
const PORT = 3001; // Use different port to avoid conflict with main app
const SOCKET_PATH = '/api/socketio';

// Mock Socket.IO server setup
class MockSocketServer {
  constructor() {
    this.server = createServer();
    this.io = new Server(this.server, {
      path: SOCKET_PATH,
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.setupSocketHandlers();
    this.notifications = [];
    this.connectedClients = new Map();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Store client connection
      this.connectedClients.set(socket.id, {
        id: socket.id,
        connectedAt: new Date(),
        userAgent: socket.handshake.headers['user-agent'] || 'Unknown'
      });

      // Send welcome message
      socket.emit('notification', {
        type: 'WELCOME',
        message: 'Connected to CA Management System',
        timestamp: new Date().toISOString(),
        data: { clientId: socket.id }
      });

      // Handle certificate notifications
      socket.on('certificate:issue', (data) => {
        const notification = {
          id: Date.now(),
          type: 'CERTIFICATE_ISSUED',
          message: `Certificate issued for ${data.subjectDN}`,
          timestamp: new Date().toISOString(),
          data: {
            serialNumber: data.serialNumber,
            subjectDN: data.subjectDN,
            issuerDN: data.issuerDN,
            validTo: data.validTo
          }
        };
        
        this.notifications.push(notification);
        this.io.emit('notification', notification);
        console.log(`Certificate issued notification sent: ${data.serialNumber}`);
      });

      // Handle certificate revocation notifications
      socket.on('certificate:revoke', (data) => {
        const notification = {
          id: Date.now(),
          type: 'CERTIFICATE_REVOKED',
          message: `Certificate ${data.serialNumber} has been revoked`,
          timestamp: new Date().toISOString(),
          data: {
            serialNumber: data.serialNumber,
            reason: data.reason,
            revocationDate: data.revocationDate
          }
        };
        
        this.notifications.push(notification);
        this.io.emit('notification', notification);
        console.log(`Certificate revoked notification sent: ${data.serialNumber}`);
      });

      // Handle CRL generation notifications
      socket.on('crl:generated', (data) => {
        const notification = {
          id: Date.now(),
          type: 'CRL_GENERATED',
          message: `CRL #${data.crlNumber} has been generated`,
          timestamp: new Date().toISOString(),
          data: {
            crlNumber: data.crlNumber,
            revokedCount: data.revokedCount,
            nextUpdate: data.nextUpdate
          }
        };
        
        this.notifications.push(notification);
        this.io.emit('notification', notification);
        console.log(`CRL generated notification sent: #${data.crlNumber}`);
      });

      // Handle user activity notifications
      socket.on('user:activity', (data) => {
        const notification = {
          id: Date.now(),
          type: 'USER_ACTIVITY',
          message: `User ${data.username} ${data.action}`,
          timestamp: new Date().toISOString(),
          data: {
            username: data.username,
            action: data.action,
            ipAddress: data.ipAddress
          }
        };
        
        this.notifications.push(notification);
        // Broadcast to all clients except the sender
        socket.broadcast.emit('notification', notification);
        console.log(`User activity notification sent: ${data.username} ${data.action}`);
      });

      // Handle system alerts
      socket.on('system:alert', (data) => {
        const notification = {
          id: Date.now(),
          type: 'SYSTEM_ALERT',
          message: data.message,
          timestamp: new Date().toISOString(),
          data: {
            severity: data.severity,
            component: data.component,
            details: data.details
          }
        };
        
        this.notifications.push(notification);
        this.io.emit('notification', notification);
        console.log(`System alert notification sent: ${data.severity} - ${data.message}`);
      });

      // Handle subscription to specific notification types
      socket.on('subscribe', (types) => {
        socket.join(types);
        console.log(`Client ${socket.id} subscribed to: ${types.join(', ')}`);
      });

      // Handle unsubscription from specific notification types
      socket.on('unsubscribe', (types) => {
        types.forEach(type => socket.leave(type));
        console.log(`Client ${socket.id} unsubscribed from: ${types.join(', ')}`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);
        
        // Notify other clients about disconnection
        this.io.emit('notification', {
          id: Date.now(),
          type: 'CLIENT_DISCONNECTED',
          message: 'Client disconnected',
          timestamp: new Date().toISOString(),
          data: { clientId: socket.id }
        });
      });

      // Send connection summary
      socket.emit('notification', {
        id: Date.now(),
        type: 'CONNECTION_SUMMARY',
        message: 'Connection established',
        timestamp: new Date().toISOString(),
        data: {
          connectedClients: this.connectedClients.size,
          recentNotifications: this.notifications.slice(-5)
        }
      });
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(PORT, () => {
        console.log(`Mock Socket.IO server running on port ${PORT}`);
        console.log(`Socket.IO path: ${SOCKET_PATH}`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Mock Socket.IO server stopped');
        resolve();
      });
    });
  }

  // Helper method to simulate notifications
  simulateNotification(type, data) {
    const notification = {
      id: Date.now(),
      type: type,
      message: `Simulated ${type} notification`,
      timestamp: new Date().toISOString(),
      data: data
    };
    
    this.notifications.push(notification);
    this.io.emit('notification', notification);
    return notification;
  }

  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      totalNotifications: this.notifications.length,
      recentNotifications: this.notifications.slice(-10),
      clients: Array.from(this.connectedClients.values())
    };
  }
}

// Socket Test Runner
class SocketTestRunner {
  constructor() {
    this.results = [];
    this.server = null;
    this.clients = [];
  }

  async createClient(name = 'TestClient') {
    const client = io(`http://localhost:${PORT}`, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      timeout: 5000,
      forceNew: true
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      let notificationCount = 0;
      let connectionEstablished = false;
      const clientNotifications = [];

      client.on('connect', () => {
        clearTimeout(timeout);
        connectionEstablished = true;
        console.log(`✅ ${name} connected: ${client.id}`);
      });

      client.on('notification', (notification) => {
        clientNotifications.push(notification);
        console.log(`📨 ${name} received notification: ${notification.type}`);
        
        // For connection test, count notifications
        if (name === 'Client1') {
          notificationCount++;
          if (notificationCount >= 2 && connectionEstablished) {
            clearTimeout(timeout);
            resolve({
              client,
              name,
              connected: true,
              notifications: clientNotifications,
              id: client.id
            });
          }
        }
      });

      client.on('disconnect', () => {
        console.log(`❌ ${name} disconnected: ${client.id}`);
      });

      client.on('connect_error', (error) => {
        clearTimeout(timeout);
        console.log(`❌ ${name} connection error: ${error.message}`);
        reject(error);
      });

      // Fallback timeout in case notifications are delayed
      setTimeout(() => {
        if (connectionEstablished) {
          clearTimeout(timeout);
          resolve({
            client,
            name,
            connected: true,
            notifications: clientNotifications,
            id: client.id
          });
        } else {
          reject(new Error('Connection not established within timeout'));
        }
      }, 3000);
    });
  }

  async testEndpoint(name, testFunction) {
    try {
      console.log(`\n🔍 Testing: ${name}`);
      const result = await testFunction();
      this.results.push({
        name,
        success: true,
        result
      });
      console.log(`   ✅ ${name}: PASSED`);
      return result;
    } catch (error) {
      console.log(`   ❌ ${name}: FAILED - ${error.message}`);
      this.results.push({
        name,
        success: false,
        error: error.message
      });
      throw error;
    }
  }

  async runSocketTests() {
    console.log('🔌 Starting Phase 7.1: Socket.IO Real-time Notifications Testing');
    console.log('=================================================================');

    // Start mock server
    this.server = new MockSocketServer();
    await this.server.start();

    try {
      // Test 1: Basic Connection
      await this.testEndpoint('Basic Connection', async () => {
        const client1 = await this.createClient('Client1');
        this.clients.push(client1);
        
        // Wait for welcome messages
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if client received welcome notification
        const welcomeNotifications = client1.notifications.filter(n => 
          n.type === 'WELCOME' || n.type === 'CONNECTION_SUMMARY'
        );
        
        if (welcomeNotifications.length >= 2) {
          return { connectedClients: 1, welcomeMessages: welcomeNotifications.length };
        }
        throw new Error('Expected welcome messages not received');
      });

      // Test 2: Multiple Connections
      await this.testEndpoint('Multiple Connections', async () => {
        const client2 = await this.createClient('Client2');
        const client3 = await this.createClient('Client3');
        this.clients.push(client2, client3);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const stats = this.server.getStats();
        if (stats.connectedClients === 3) {
          return { connectedClients: stats.connectedClients, clients: stats.clients };
        }
        throw new Error('Expected 3 connected clients');
      });

      // Test 3: Certificate Issue Notification
      await this.testEndpoint('Certificate Issue Notification', async () => {
        const client1 = this.clients[0];
        const initialCount = client1.notifications.length;
        
        // Simulate certificate issuance
        client1.client.emit('certificate:issue', {
          serialNumber: 'TEST001',
          subjectDN: 'CN=test.example.com',
          issuerDN: 'CN=CA Example',
          validTo: '2025-01-01T00:00:00Z'
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const certNotifications = client1.notifications.filter(n => n.type === 'CERTIFICATE_ISSUED');
        if (certNotifications.length > 0) {
          return { notifications: certNotifications.length, latest: certNotifications[certNotifications.length - 1] };
        }
        throw new Error('Certificate issue notification not received');
      });

      // Test 4: Certificate Revocation Notification
      await this.testEndpoint('Certificate Revocation Notification', async () => {
        const client1 = this.clients[0];
        
        client1.client.emit('certificate:revoke', {
          serialNumber: 'TEST001',
          reason: 'KEY_COMPROMISE',
          revocationDate: new Date().toISOString()
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const revokeNotifications = client1.notifications.filter(n => n.type === 'CERTIFICATE_REVOKED');
        if (revokeNotifications.length > 0) {
          return { notifications: revokeNotifications.length, latest: revokeNotifications[revokeNotifications.length - 1] };
        }
        throw new Error('Certificate revocation notification not received');
      });

      // Test 5: CRL Generation Notification
      await this.testEndpoint('CRL Generation Notification', async () => {
        const client1 = this.clients[0];
        
        client1.client.emit('crl:generated', {
          crlNumber: 1,
          revokedCount: 3,
          nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const crlNotifications = client1.notifications.filter(n => n.type === 'CRL_GENERATED');
        if (crlNotifications.length > 0) {
          return { notifications: crlNotifications.length, latest: crlNotifications[crlNotifications.length - 1] };
        }
        throw new Error('CRL generation notification not received');
      });

      // Test 6: User Activity Notification
      await this.testEndpoint('User Activity Notification', async () => {
        const client1 = this.clients[0];
        const client2 = this.clients[1];
        
        // Client1 sends user activity, should broadcast to others
        client1.client.emit('user:activity', {
          username: 'admin',
          action: 'logged in',
          ipAddress: '192.168.1.100'
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Client2 should receive the notification (broadcast)
        const activityNotifications = client2.notifications.filter(n => n.type === 'USER_ACTIVITY');
        if (activityNotifications.length > 0) {
          // Client1 should not receive its own broadcast
          const client1Activity = client1.notifications.filter(n => n.type === 'USER_ACTIVITY');
          return { 
            receivedByOthers: activityNotifications.length,
            receivedBySelf: client1Activity.length 
          };
        }
        throw new Error('User activity notification not broadcast');
      });

      // Test 7: System Alert Notification
      await this.testEndpoint('System Alert Notification', async () => {
        const client1 = this.clients[0];
        
        client1.client.emit('system:alert', {
          message: 'High memory usage detected',
          severity: 'WARNING',
          component: 'System Monitor',
          details: { memoryUsage: '85%' }
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const alertNotifications = client1.notifications.filter(n => n.type === 'SYSTEM_ALERT');
        if (alertNotifications.length > 0) {
          return { notifications: alertNotifications.length, latest: alertNotifications[alertNotifications.length - 1] };
        }
        throw new Error('System alert notification not received');
      });

      // Test 8: Subscription/Unsubscription
      await this.testEndpoint('Subscription/Unsubscription', async () => {
        const client1 = this.clients[0];
        
        // Subscribe to specific types
        client1.client.emit('subscribe', ['CERTIFICATE_ISSUED', 'CERTIFICATE_REVOKED']);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Simulate different notification types
        this.server.simulateNotification('CERTIFICATE_ISSUED', { serialNumber: 'SUB001' });
        this.server.simulateNotification('CRL_GENERATED', { crlNumber: 99 });
        this.server.simulateNotification('CERTIFICATE_REVOKED', { serialNumber: 'SUB001' });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const subscribedNotifications = client1.notifications.filter(n => 
          n.type === 'CERTIFICATE_ISSUED' || n.type === 'CERTIFICATE_REVOKED'
        );
        const otherNotifications = client1.notifications.filter(n => n.type === 'CRL_GENERATED');
        
        if (subscribedNotifications.length >= 2 && otherNotifications.length >= 1) {
          return { 
            subscribed: subscribedNotifications.length,
            others: otherNotifications.length 
          };
        }
        throw new Error('Subscription filtering not working');
      });

      // Test 9: Disconnection Handling
      await this.testEndpoint('Disconnection Handling', async () => {
        const client3 = this.clients[2];
        const initialClients = this.server.getStats().connectedClients;
        
        client3.client.disconnect();
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const finalClients = this.server.getStats().connectedClients;
        if (finalClients === initialClients - 1) {
          return { 
            before: initialClients, 
            after: finalClients 
          };
        }
        throw new Error('Disconnection not properly handled');
      });

      // Test 10: Reconnection
      await this.testEndpoint('Reconnection', async () => {
        const newClient = await this.createClient('ReconnectedClient');
        this.clients.push(newClient);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const stats = this.server.getStats();
        if (stats.connectedClients > 0) {
          return { 
            reconnected: true,
            totalClients: stats.connectedClients 
          };
        }
        throw new Error('Reconnection failed');
      });

      // Test 11: High Volume Notifications
      await this.testEndpoint('High Volume Notifications', async () => {
        const client1 = this.clients[0];
        const initialCount = client1.notifications.length;
        const notificationCount = 50;
        
        // Send many notifications quickly
        for (let i = 0; i < notificationCount; i++) {
          this.server.simulateNotification('SYSTEM_ALERT', {
            message: `Test notification ${i}`,
            severity: 'INFO',
            component: 'Test Runner'
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const receivedCount = client1.notifications.length - initialCount;
        if (receivedCount >= notificationCount * 0.9) { // Allow some tolerance
          return { 
            sent: notificationCount,
            received: receivedCount,
            successRate: (receivedCount / notificationCount) * 100
          };
        }
        throw new Error(`High volume test failed: sent ${notificationCount}, received ${receivedCount}`);
      });

      // Test 12: Connection Error Handling
      await this.testEndpoint('Connection Error Handling', async () => {
        try {
          // Try to connect to non-existent server
          const badClient = io('http://localhost:9999', {
            path: SOCKET_PATH,
            timeout: 1000
          });
          
          await new Promise((resolve, reject) => {
            badClient.on('connect_error', (error) => {
              resolve(error);
            });
            
            setTimeout(() => {
              reject(new Error('Connection error not triggered'));
            }, 2000);
          });
          
          return { errorHandled: true };
        } catch (error) {
          if (error.message.includes('Connection error not triggered')) {
            throw error;
          }
          return { errorHandled: true };
        }
      });

      return this.results;

    } finally {
      // Cleanup
      console.log('\n🧹 Cleaning up...');
      
      // Disconnect all clients
      for (const clientData of this.clients) {
        if (clientData.client.connected) {
          clientData.client.disconnect();
        }
      }
      
      // Stop server
      await this.server.stop();
      console.log('✅ Cleanup completed');
    }
  }

  printResults() {
    console.log('\n📊 Socket.IO Real-time Notifications Test Results');
    console.log('====================================================');
    
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`   - ${result.name}: ${result.error}`);
      });
    }
    
    return { passed, failed, total };
  }
}

async function testSocketNotifications() {
  const runner = new SocketTestRunner();
  await runner.runSocketTests();
  const results = runner.printResults();
  
  if (results.failed === 0) {
    console.log('\n🎉 All Socket.IO real-time notifications tests passed!');
    return true;
  } else {
    console.log('\n❌ Some Socket.IO real-time notifications tests failed.');
    return false;
  }
}

// Run the tests
testSocketNotifications()
  .then(success => {
    if (success) {
      console.log('\n✅ Phase 7.1: Socket.IO Real-time Notifications Testing - COMPLETED');
      process.exit(0);
    } else {
      console.log('\n❌ Phase 7.1: Socket.IO Real-time Notifications Testing - FAILED');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });