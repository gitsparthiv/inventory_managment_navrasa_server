const { Server } = require("socket.io");

let io = null;

const initSocket = (httpServer, authMiddleware = null) => {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  if (authMiddleware) {
    io.use(authMiddleware);
  }

  io.on("connection", (socket) => {
    const user = socket.user || {};
    console.log(`[Socket.IO] Client connected: socketId=${socket.id}, user=${user.email || user.userId || "anonymous"}`);

    if (user.tenantId) {
      const tenantRoom = `tenant:${user.tenantId}`;
      socket.join(tenantRoom);
      console.log(`[Socket.IO] Socket ${socket.id} joined room: ${tenantRoom}`);
    }

    if (user.tenantId && Array.isArray(user.branchIds)) {
      user.branchIds.forEach((branchId) => {
        const branchRoom = `branch:${user.tenantId}:${branchId}`;
        socket.join(branchRoom);
        console.log(`[Socket.IO] Socket ${socket.id} joined room: ${branchRoom}`);
      });
    }

    if (user.userId) {
      socket.join(`user:${user.userId}`);
    }

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.IO] Client disconnected: socketId=${socket.id}, reason=${reason}`);
    });
  });

  console.log("Socket.IO initialized successfully");
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized. Call initSocket(httpServer) first.");
  }
  return io;
};

const emitToTenant = (tenantId, event, data) => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit(event, data);
};

const emitToBranch = (tenantId, branchId, event, data) => {
  if (!io) return;
  io.to(`branch:${tenantId}:${branchId}`).emit(event, data);
};

const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

module.exports = {
  initSocket,
  getIO,
  emitToTenant,
  emitToBranch,
  emitToUser,
};

