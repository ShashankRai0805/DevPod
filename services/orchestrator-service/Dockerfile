FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Create a smaller production image
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the built artifacts from the builder stage
COPY --from=builder /app/dist ./dist

# The default orchestrator port is 4100
EXPOSE 4100

# Start the server
CMD ["npm", "start"]
