const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// سيرفر HTTP واحد (يخدم كل شيء)
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            rooms: Object.keys(rooms),
            connections: wss ? wss.clients.size : 0
        }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Camera Parent WebSocket Server - يعمل ✅');
    }
});

// WebSocket على نفس السيرفر
const wss = new WebSocket.Server({ server });

console.log(`🚀 Server starting on port ${PORT}`);

// تخزين الغرف
const rooms = {};

wss.on('connection', (ws, req) => {
    console.log('🔗 New connection');

    let clientRoom = null;
    let clientRole = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            // رسالة انضمام
            if (data.type === 'join') {
                clientRoom = data.room;
                clientRole = data.role;

                if (!rooms[clientRoom]) {
                    rooms[clientRoom] = {};
                }

                rooms[clientRoom][clientRole] = ws;

                console.log(`✅ ${clientRole} joined room: ${clientRoom}`);

                const otherRole = clientRole === 'child' ? 'parent' : 'child';
                const otherWs = rooms[clientRoom][otherRole];

                if (otherWs && otherWs.readyState === WebSocket.OPEN) {
                    otherWs.send(JSON.stringify({
                        type: `${clientRole}-joined`,
                        room: clientRoom
                    }));

                    ws.send(JSON.stringify({
                        type: `${otherRole}-present`,
                        room: clientRoom
                    }));

                    console.log(`📢 Notified ${otherRole}`);
                } else {
                    ws.send(JSON.stringify({
                        type: 'waiting',
                        message: `بانتظار ${otherRole === 'child' ? 'الابن' : 'الأب'}`
                    }));
                }
                return;
            }

            // باقي الرسائل: نمررها للطرف الآخر
            if (!clientRoom || !clientRole) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'يجب الانضمام لغرفة أولاً'
                }));
                return;
            }

            const otherRole = clientRole === 'child' ? 'parent' : 'child';
            const otherWs = rooms[clientRoom]?.[otherRole];

            if (otherWs && otherWs.readyState === WebSocket.OPEN) {
                otherWs.send(message.toString());
            }

        } catch (e) {
            console.error('❌ Error:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('❌ Connection closed');

        if (clientRoom && clientRole && rooms[clientRoom]) {
            delete rooms[clientRoom][clientRole];

            const otherRole = clientRole === 'child' ? 'parent' : 'child';
            const otherWs = rooms[clientRoom][otherRole];

            if (otherWs && otherWs.readyState === WebSocket.OPEN) {
                otherWs.send(JSON.stringify({
                    type: `${clientRole}-left`
                }));
            }

            if (Object.keys(rooms[clientRoom]).length === 0) {
                delete rooms[clientRoom];
                console.log(`🗑️ Room ${clientRoom} deleted`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('❌ WS error:', error.message);
    });
});

server.listen(PORT, () => {
    console.log(`✅ Server ready on port ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Rejection:', reason);
});
