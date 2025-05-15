# Dump

Упрощенная версия чат-приложения с основными функциями: текстовой, голосовой и видео коммуникацией, созданием и управлением серверами и каналами.

## Функциональность

- Аутентификация пользователей (регистрация и вход)
- Создание и управление серверами
- Создание текстовых и голосовых каналов
- Обмен текстовыми сообщениями
- Голосовая и видео связь
- Кастомизация профиля

## Технологии

### Бэкенд
- Python 3.8+
- FastAPI
- SQLAlchemy
- PostgreSQL
- WebSocket для реального времени
- JWT для аутентификации

### Фронтенд
- React
- Material-UI
- Axios для HTTP запросов
- WebSocket для реального времени

## Установка и запуск

### Предварительные требования
- Python 3.8+
- Node.js 14+
- PostgreSQL

### Бэкенд

1. Создайте виртуальное окружение Python:
```bash
python -m venv venv
source venv/bin/activate  # для Linux/Mac
venv\Scripts\activate     # для Windows
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Создайте базу данных PostgreSQL:
```sql
CREATE DATABASE dump;
```

4. Настройте переменные окружения:
```bash
cp .env.example .env
# Отредактируйте .env файл, указав ваши настройки
```

5. Запустите миграции:
```bash
alembic upgrade head
```

6. Запустите сервер:
```bash
uvicorn backend.main:app --reload
```

### Фронтенд

1. Перейдите в директорию frontend:
```bash
cd frontend
```

2. Установите зависимости:
```bash
npm install
```

3. Запустите приложение:
```bash
npm start
```

## Использование

1. Откройте http://localhost:3000 в браузере
2. Зарегистрируйтесь или войдите в существующий аккаунт
3. Создайте новый сервер или присоединитесь к существующему
4. Создавайте каналы и общайтесь!

## Структура проекта

```
dump/
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── crud.py
│   ├── auth.py
│   └── database.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   └── App.js
│   └── package.json
└── README.md
```

## Лицензия

MIT 