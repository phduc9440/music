# syntax=docker/dockerfile:1
# ---- Tầng 1: build jar bằng Maven + Java 21 ----
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY src src
# application.yaml bị .gitignore (chứa bí mật) nên image dùng bản .example; mọi giá trị thật được ghi đè
# bằng biến môi trường trong docker-compose.yml.
RUN cp src/main/resources/application.yaml.example src/main/resources/application.yaml \
    && ./mvnw -B -q -DskipTests package \
    && cp target/*.jar /app.jar

# ---- Tầng 2: chạy trên JRE 21 cùng MuseScore 3.6.2 ----
FROM eclipse-temurin:21-jre-jammy
ARG MUSESCORE_URL=https://github.com/musescore/MuseScore/releases/download/v3.6.2/MuseScore-3.6.2.548021370-x86_64.AppImage
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl libasound2 libfontconfig1 libfreetype6 libgl1 libglib2.0-0 libnss3 libpulse0 \
        libsm6 libxext6 libxkbcommon0 libxrender1 libxcb-xinerama0 libxcb-xkb1 libxkbcommon-x11-0 \
        libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-render-util0 libxcb-shape0 \
    && rm -rf /var/lib/apt/lists/*
# Container không có FUSE nên giải nén AppImage thay vì chạy trực tiếp.
RUN curl -fsSL "$MUSESCORE_URL" -o /tmp/mscore.AppImage \
    && chmod +x /tmp/mscore.AppImage && cd /opt \
    && /tmp/mscore.AppImage --appimage-extract >/dev/null \
    && mv /opt/squashfs-root /opt/musescore && rm /tmp/mscore.AppImage
ENV QT_QPA_PLATFORM=offscreen \
    MUSESCORE_PATH=/opt/musescore/AppRun
# Kiểm tra MuseScore chạy được ngay lúc build.
RUN "$MUSESCORE_PATH" -v
WORKDIR /app
COPY --from=build /app.jar app.jar
ENV APP_STORAGE_LOCAL_ROOT=/data/storage
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
