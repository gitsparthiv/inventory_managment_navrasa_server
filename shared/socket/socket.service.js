const { Server } = require("socket.io");

let io = null;

/**
 * Initialize Socket.IO instance attached to HTTP server.
 * @param {import("http").Server} httpServer
 * @param {Function} [authMiddleware] - Optional Socket.IO middleware for JWT auth
 * @returns {Server}
 */
const initSocket = (httpServer, authMiddleware = null) => {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Attach auth middleware if provided
  if (authMiddleware) {
    io.use(authMiddleware);
  }

  io.on("connection", (socket) => {
    const user = socket.user || {};
    console.log(`[Socket.IO] Client connected: socketId=${socket.id}, user=${user.email || user.userId || "anonymous"}`);

    // Join tenant-wide room
    if (user.tenantId) {
      const tenantRoom = `tenant:${user.tenantId}`;
      socket.join(tenantRoom);
      console.log(`[Socket.IO] Socket ${socket.id} joined room: ${tenantRoom}`);
    }

    // Join branch-specific rooms
    if (user.tenantId && Array.isArray(user.branchIds)) {
      user.branchIds.forEach((branchId) => {
        const branchRoom = `branch:${user.tenantId}:${branchId}`;
        socket.join(branchRoom);
        console.log(`[Socket.IO] Socket ${socket.id} joined room: ${branchRoom}`);
      });
    }

    // Join personal user room
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

/**
 * Get current initialized Socket.IO instance.
 * @returns {Server}
 */
const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized. Call initSocket(httpServer) first.");
  }
  return io;
};

/**
 * Emit event to all sockets within a specific tenant.
 */
const emitToTenant = (tenantId, event, data) => {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit(event, data);
};

/**
 * Emit event to all sockets within a specific tenant and branch.
 */
const emitToBranch = (tenantId, branchId, event, data) => {
  if (!io) return;
  io.to(`branch:${tenantId}:${branchId}`).emit(event, data);
};

/**
 * Emit event to a specific user.
 */
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

