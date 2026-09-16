# 백엔드 운영 이미지. Cloud Run 이 이걸 띄운다.
#
# 빌드 컨텍스트는 **저장소 루트**다. 경전 시드와 임베딩이 backend/ 밖(data/scriptures/)에 있고,
# 서버가 기동할 때 그 파일을 읽기 때문이다.
#
#   docker build -f docker/backend/Dockerfile -t buddha-words-backend .
#
# 로컬 개발은 이 파일을 쓰지 않는다. backend/.venv 로 직접 띄운다.

# ── 1단: 의존성 ────────────────────────────────────────────
FROM python:3.13-slim AS deps

# uv 는 공식 이미지에서 실행 파일만 꺼내 온다. pip 로 깔면 버전이 흔들린다.
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# 잠금 파일만 먼저 넣어 레이어를 나눈다. 소스만 바뀐 빌드는 설치를 건너뛴다.
COPY backend/pyproject.toml backend/uv.lock ./
# --frozen: 잠금 파일을 갱신하지 않는다. 운영이 개발자 로컬과 다른 버전을 쓰면 안 된다.
# --no-dev: pytest·ruff 는 운영에 넣지 않는다.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ── 2단: 실행 ──────────────────────────────────────────────
FROM python:3.13-slim AS runtime

# tini 가 1번 프로세스를 맡아 SIGTERM 을 uvicorn 에 넘긴다.
# 없으면 Cloud Run 이 리비전을 걷어낼 때 진행 중인 요청이 잘린다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

# 루트로 돌리지 않는다. 컨테이너가 뚫려도 파일 시스템을 못 고치게 한다.
RUN useradd --create-home --uid 10001 buddha

WORKDIR /app
COPY --from=deps /app/.venv /app/.venv

# 서버 코드와, 서버가 읽는 경전 데이터. 둘의 상대 경로가 저장소와 같아야 한다
# (backend/app/domains/scripture/repo.py 가 parents[4]/data/scriptures 를 본다).
COPY --chown=buddha:buddha backend/app /app/backend/app

# 경전. seed 는 답변이, embeddings 는 벡터 검색이 읽는다
COPY --chown=buddha:buddha data/scriptures/seed.json /app/data/scriptures/seed.json
COPY --chown=buddha:buddha data/scriptures/embeddings.json /app/data/scriptures/embeddings.json

# 공유 카드를 서버가 그린다. 색 토큰과 시간대 배정(visual-theme)과 부처 그림이 필요하다
# (domains/share/tokens.py · artwork.py). 글꼴은 backend/app/domains/share/fonts/ 안이라 위에서 왔다
COPY --chown=buddha:buddha design/foundations/_tokens.css /app/design/foundations/_tokens.css
COPY --chown=buddha:buddha spec/visual-theme.ts /app/spec/visual-theme.ts
COPY --chown=buddha:buddha assets /app/assets

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONPATH=/app/backend \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=prod

USER buddha

# Cloud Run 이 PORT 를 준다. 우리가 고른 값을 박으면 그 리비전은 트래픽을 못 받는다.
# 기본값 8080 은 로컬에서 docker run 으로 띄워 볼 때만 쓰인다.
ENV PORT=8080
EXPOSE 8080

# --proxy-headers: Cloud Run 앞단이 붙이는 X-Forwarded-* 를 믿는다.
# --workers 를 늘리지 않는다. Cloud Run 은 인스턴스를 늘려 확장한다.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
