FROM node:20-alpine

WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm install

# 소스 복사 & 빌드
COPY . .
RUN npm run build

# 실행
CMD ["node", "dist/main.js"]
