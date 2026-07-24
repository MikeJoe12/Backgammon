/**
 * ChronoGammon Server.
 * Node.js Express server with WebSockets for real-time multiplayer.
 * Compatible with local development and cloud hosting (e.g. Render.com).
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bound to 0.0.0.0 for cloud host compatibility (Render, Heroku, Docker)

// Health check endpoint for Render.com deployment health probes
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Serve static files from the workspace root
app.use(express.static(__dirname, { dotfiles: 'ignore' }));

// Route for entry point
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Map to store active rooms
// Room structure: { code: string, players: [ { ws, playerId: 1 | 2 } ], turn: 1 | 2, dice: [], remaining: [] }
const rooms = new Map();

// Helper to generate a random 4-letter uppercase code
function generateRoomCode() {
    let code = '';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid lookalikes like I, O, 0, 1
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms.has(code));
    return code;
}

// Broadcast helper for room
function broadcastToRoom(room, messageObj, excludeWs = null) {
    const payload = JSON.stringify(messageObj);
    room.players.forEach(p => {
        if (p.ws !== excludeWs && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(payload);
        }
    });
}

// WebSocket Heartbeat / Keep-alive ping-pong (Prevents Render proxy idle timeouts after 55s)
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Terminating unresponsive WebSocket connection.');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    let currentRoomCode = null;
    let currentPlayerId = null;

    ws.on('message', (message) => {
        try {
            const { type, data } = JSON.parse(message);
            
            switch (type) {
                case 'create-room': {
                    const code = generateRoomCode();
                    currentRoomCode = code;
                    currentPlayerId = 1;

                    const newRoom = {
                        code: code,
                        players: [{ ws, playerId: 1 }],
                        turn: 1,
                        dice: [],
                        remaining: [],
                        isOpeningRoll: true,
                        openingRolls: { 1: null, 2: null },
                        openingRollTurn: 1
                    };
                    rooms.set(code, newRoom);

                    ws.send(JSON.stringify({
                        type: 'room-created',
                        data: { code, playerId: 1 }
                    }));
                    console.log(`Room created: ${code}`);
                    break;
                }

                case 'join-room': {
                    const code = data.code ? data.code.toUpperCase() : '';
                    const room = rooms.get(code);

                    if (!room) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            data: { message: 'Room code not found.' }
                        }));
                        return;
                    }

                    if (room.players.length >= 2) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            data: { message: 'Room is already full.' }
                        }));
                        return;
                    }

                    currentRoomCode = code;
                    currentPlayerId = 2;
                    room.players.push({ ws, playerId: 2 });

                    ws.send(JSON.stringify({
                        type: 'room-joined',
                        data: { code, playerId: 2 }
                    }));

                    console.log(`Player 2 joined room: ${code}`);

                    // Start Game! Broadcast to both players
                    broadcastToRoom(room, {
                        type: 'game-start',
                        data: { turn: 1 }
                    });
                    break;
                }

                case 'roll-dice': {
                    const room = rooms.get(currentRoomCode);
                    if (!room) return;

                    // Validate it is the player's turn to roll
                    if (room.isOpeningRoll) {
                        if (room.openingRollTurn !== currentPlayerId) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                data: { message: "It's not your turn to roll." }
                            }));
                            return;
                        }
                    } else {
                        if (room.turn !== currentPlayerId) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                data: { message: "It's not your turn to roll." }
                            }));
                            return;
                        }
                    }

                    // Generate dice values on server to prevent desync / cheating
                    if (room.isOpeningRoll) {
                        const rollVal = Math.floor(Math.random() * 6) + 1;
                        room.openingRolls[currentPlayerId] = rollVal;

                        if (room.openingRollTurn === 1) {
                            room.openingRollTurn = 2;
                            broadcastToRoom(room, {
                                type: 'opening-roll-first',
                                data: { val: rollVal }
                            });
                        } else {
                            // Player 2 rolled. Compare!
                            const p1Val = room.openingRolls[1];
                            const p2Val = rollVal;
                            room.dice = [p1Val, p2Val];

                            if (p1Val === p2Val) {
                                // Tie! Reroll starting from P1
                                room.openingRolls = { 1: null, 2: null };
                                room.openingRollTurn = 1;
                                broadcastToRoom(room, {
                                    type: 'opening-roll-tie',
                                    data: { val: p2Val }
                                });
                            } else {
                                // Completed!
                                room.isOpeningRoll = false;
                                room.turn = p1Val > p2Val ? 1 : 2;
                                room.remaining = [p1Val, p2Val];
                                broadcastToRoom(room, {
                                    type: 'opening-roll-completed',
                                    data: {
                                        val: p2Val,
                                        dice: room.dice,
                                        remaining: room.remaining,
                                        turn: room.turn
                                    }
                                });
                            }
                        }
                    } else {
                        const d1 = Math.floor(Math.random() * 6) + 1;
                        const d2 = Math.floor(Math.random() * 6) + 1;
                        room.dice = [d1, d2];
                        if (d1 === d2) {
                            room.remaining = [d1, d1, d1, d1];
                        } else {
                            room.remaining = [d1, d2];
                        }

                        broadcastToRoom(room, {
                            type: 'dice-rolled',
                            data: {
                                dice: room.dice,
                                remaining: room.remaining,
                                turn: room.turn
                            }
                        });
                    }
                    break;
                }

                case 'make-move': {
                    const room = rooms.get(currentRoomCode);
                    if (!room) return;

                    // Sync the move details
                    const { from, to, usedDie } = data;
                    
                    // Consume the used die value from the server state
                    const index = room.remaining.indexOf(usedDie);
                    if (index !== -1) {
                        room.remaining.splice(index, 1);
                    }

                    // Broadcast the move to the other player
                    broadcastToRoom(room, {
                        type: 'move-executed',
                        data: { from, to, playerId: currentPlayerId, usedDie }
                    }, ws);
                    break;
                }

                case 'undo-move': {
                    const room = rooms.get(currentRoomCode);
                    if (!room) return;
                    
                    // Restore the die
                    const { die } = data;
                    room.remaining.push(die);

                    broadcastToRoom(room, {
                        type: 'move-undone',
                        data: { playerId: currentPlayerId, die }
                    }, ws);
                    break;
                }

                case 'end-turn': {
                    const room = rooms.get(currentRoomCode);
                    if (!room) return;

                    if (room.turn !== currentPlayerId) return;

                    // Switch active turn
                    room.turn = room.turn === 1 ? 2 : 1;
                    room.dice = [];
                    room.remaining = [];

                    broadcastToRoom(room, {
                        type: 'turn-changed',
                        data: { turn: room.turn }
                    });
                    break;
                }

                case 'reset-game': {
                    const room = rooms.get(currentRoomCode);
                    if (!room) return;

                    room.turn = 1;
                    room.dice = [];
                    room.remaining = [];
                    room.isOpeningRoll = true;
                    room.openingRolls = { 1: null, 2: null };
                    room.openingRollTurn = 1;

                    broadcastToRoom(room, {
                        type: 'game-reset'
                    });
                    break;
                }
            }
        } catch (e) {
            console.error('Error handling WebSocket message', e);
        }
    });

    ws.on('close', () => {
        if (currentRoomCode) {
            const room = rooms.get(currentRoomCode);
            if (room) {
                console.log(`Player ${currentPlayerId} disconnected from room: ${currentRoomCode}`);
                
                // Inform the other player
                broadcastToRoom(room, {
                    type: 'opponent-disconnected',
                    data: { playerId: currentPlayerId }
                }, ws);

                // Clean up the room
                rooms.delete(currentRoomCode);
            }
        }
    });
});

// Clean server shutdown handler
function gracefulShutdown(signal) {
    console.log(`Received ${signal}. Closing server gracefully...`);
    clearInterval(pingInterval);
    wss.clients.forEach(ws => ws.close(1001, 'Server shutting down'));
    server.close(() => {
        console.log('HTTP and WebSocket server closed cleanly.');
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, HOST, () => {
    console.log(`ChronoGammon server is running on http://${HOST}:${PORT}`);
});
