from src.schedule.parser import parse_schedule_expression


def test_every_day_9am():
    result = parse_schedule_expression("毎日9時に")
    assert result is not None
    assert result["hour"] == 9
    assert result["minute"] == 0


def test_every_monday():
    result = parse_schedule_expression("毎週月曜日の10時に")
    assert result is not None
    assert result["day_of_week"] == "mon"


def test_invalid_expression():
    result = parse_schedule_expression("意味不明な文字列")
    assert result is None
