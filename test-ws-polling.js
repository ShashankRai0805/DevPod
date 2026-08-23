const { io } = require("socket.io-client");
const socket = io("https://runner-laha.codecohort.xyz", { transports: ['polling'] });
socket.on("connect", () => {
  console.log("Connected with id:", socket.id);
  process.exit(0);
});
socket.on("connect_error", (err) => {
  console.log("Connection Error:", err.message);
  process.exit(1);
});
setTimeout(() => { console.log("Timeout"); process.exit(1); }, 5000);
