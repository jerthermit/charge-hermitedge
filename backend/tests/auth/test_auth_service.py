from app.auth import service
from types import SimpleNamespace

def test_authenticate_user_valid(mocker):
    """
    Unit test for service.authenticate_user()

    Covers:
    - Finds user by email
    - Verifies password
    - Returns user on success
    """
    dummy_user = SimpleNamespace(email="test@example.com", hashed_password="hashed123")

    mocker.patch("app.auth.service.get_user_by_email", return_value=dummy_user)
    mocker.patch("app.core.security.verify_password", return_value=True)

    result = service.authenticate_user(db=None, email="test@example.com", password="password123")
    assert result == dummy_user

def test_authenticate_user_invalid_password(mocker):
    """
    Fails if password is incorrect
    """
    dummy_user = SimpleNamespace(email="test@example.com", hashed_password="wrong")

    mocker.patch("app.auth.service.get_user_by_email", return_value=dummy_user)
    mocker.patch("app.core.security.verify_password", return_value=False)

    result = service.authenticate_user(db=None, email="test@example.com", password="wrongpass")
    assert result is None

def test_authenticate_user_user_not_found(mocker):
    """
    Fails if user not found
    """
    mocker.patch("app.auth.service.get_user_by_email", return_value=None)

    result = service.authenticate_user(db=None, email="notfound@example.com", password="any")
    assert result is None