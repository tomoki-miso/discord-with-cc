from src.stores.calendar import CalendarStore, CalendarMode


def test_calendar_mode_off_by_default():
    store = CalendarStore()
    assert store.is_enabled("ch1") is False


def test_enable_calendar_mode():
    store = CalendarStore()
    store.enable("ch1")
    assert store.is_enabled("ch1") is True


def test_disable_calendar_mode():
    store = CalendarStore()
    store.enable("ch1")
    store.disable("ch1")
    assert store.is_enabled("ch1") is False


def test_calendar_mode_enum():
    assert CalendarMode.ON == "on"
    assert CalendarMode.OFF == "off"
