from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.database import get_db
from app.core.security import get_current_active_user

from . import advisor, management, schemas, service, sessions


router = APIRouter(
    prefix="/charging",
    tags=["charging"],
)

ResultT = TypeVar("ResultT")


def _execute(
    operation: Callable[..., ResultT],
    *args: Any,
    **kwargs: Any,
) -> ResultT:
    try:
        return operation(*args, **kwargs)
    except service.ChargingServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "code": exc.code,
                "message": exc.message,
            },
        ) from exc

async def _execute_async(
    operation: Callable[..., Awaitable[ResultT]],
    *args: Any,
    **kwargs: Any,
) -> ResultT:
    try:
        return await operation(
            *args,
            **kwargs,
        )
    except service.ChargingServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "code": exc.code,
                "message": exc.message,
            },
        ) from exc

@router.get(
    "/access",
    response_model=schemas.AccountAccessRead,
)
def read_access(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        service.get_account_access,
        db,
        current_user.id,
    )


@router.get(
    "/driver",
    response_model=schemas.DriverWorkspaceRead,
)
def read_driver_workspace(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        service.get_driver_workspace,
        db,
        current_user.id,
    )


@router.get(
    "/vehicles",
    response_model=list[schemas.VehicleRead],
)
def read_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        service.list_vehicles,
        db,
        current_user.id,
    )


@router.post(
    "/vehicles",
    response_model=schemas.VehicleRead,
    status_code=status.HTTP_201_CREATED,
)
def add_vehicle(
    payload: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        service.create_vehicle,
        db,
        current_user.id,
        payload,
    )


@router.patch(
    "/vehicles/{vehicle_id}",
    response_model=schemas.VehicleRead,
)
def edit_vehicle(
    vehicle_id: str,
    payload: schemas.VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        service.update_vehicle,
        db,
        current_user.id,
        vehicle_id,
        payload,
    )


@router.put(
    "/vehicles/{vehicle_id}/battery",
    response_model=schemas.VehicleRead,
)
def set_vehicle_battery(
    vehicle_id: str,
    payload: schemas.VehicleBatteryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        service.update_vehicle_battery,
        db,
        current_user.id,
        vehicle_id,
        payload,
    )


@router.post(
    "/estimate",
    response_model=schemas.ChargeEstimateRead,
)
def estimate_charge(
    payload: schemas.ChargeEstimateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        service.calculate_estimate,
        db,
        current_user.id,
        payload,
    )


@router.get(
    "/sessions",
    response_model=list[
        schemas.ChargingSessionRead
    ],
)
def read_sessions(
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        sessions.list_sessions,
        db,
        current_user.id,
        limit,
    )


@router.post(
    "/sessions",
    response_model=schemas.ChargingSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def add_session(
    payload: schemas.SessionStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        sessions.create_session,
        db,
        current_user.id,
        payload,
    )


@router.get(
    "/sessions/{session_id}",
    response_model=schemas.ChargingSessionRead,
)
def read_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        sessions.get_session,
        db,
        current_user.id,
        session_id,
    )


@router.post(
    "/sessions/{session_id}/start",
    response_model=schemas.ChargingSessionRead,
)
def start_session(
    session_id: str,
    payload: schemas.SessionCommandRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        sessions.begin_session,
        db,
        current_user.id,
        session_id,
        payload,
    )


@router.post(
    "/sessions/{session_id}/complete-synthetic",
    response_model=schemas.ChargingSessionRead,
)
def complete_synthetic_session(
    session_id: str,
    payload: schemas.SessionCommandRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        sessions.complete_synthetic_session,
        db,
        current_user.id,
        session_id,
        payload,
    )


@router.post(
    "/sessions/{session_id}/cancel",
    response_model=schemas.ChargingSessionRead,
)
def cancel_session(
    session_id: str,
    payload: schemas.SessionCommandRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        sessions.cancel_session,
        db,
        current_user.id,
        session_id,
        payload,
    )


@router.get(
    "/sessions/{session_id}/receipt",
    response_model=schemas.ReceiptRead,
)
def read_receipt(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        sessions.get_receipt,
        db,
        current_user.id,
        session_id,
    )


@router.get(
    "/networks/{network_id}/workspace",
    response_model=(
        schemas.ManagementWorkspaceRead
    ),
)
def read_management_workspace(
    network_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        management.get_management_workspace,
        db,
        current_user.id,
        network_id,
    )


@router.post(
    "/networks/{network_id}/ask",
    response_model=schemas.NetworkAnswerRead,
)
async def ask_network(
    network_id: str,
    payload: schemas.NetworkQuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return await _execute_async(
        advisor.answer_network_question,
        db,
        current_user.id,
        network_id,
        payload,
    )


@router.post(
    "/networks/{network_id}/locations",
    response_model=schemas.ManagedLocationRead,
    status_code=status.HTTP_201_CREATED,
)
def add_location(
    network_id: str,
    payload: schemas.LocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        management.create_location,
        db,
        current_user.id,
        network_id,
        payload,
    )


@router.patch(
    "/locations/{location_id}",
    response_model=schemas.ManagedLocationRead,
)
def edit_location(
    location_id: str,
    payload: schemas.LocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        management.update_location,
        db,
        current_user.id,
        location_id,
        payload,
    )


@router.post(
    "/locations/{location_id}/publish",
    response_model=schemas.ManagedLocationRead,
)
def publish_location(
    location_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        management.publish_location,
        db,
        current_user.id,
        location_id,
    )


@router.post(
    "/locations/{location_id}/offline",
    response_model=schemas.ManagedLocationRead,
)
def take_location_offline(
    location_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        management.take_location_offline,
        db,
        current_user.id,
        location_id,
    )


@router.post(
    "/locations/{location_id}/chargers",
    response_model=schemas.ManagedChargerRead,
    status_code=status.HTTP_201_CREATED,
)
def add_charger(
    location_id: str,
    payload: schemas.ChargerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        management.create_charger,
        db,
        current_user.id,
        location_id,
        payload,
    )


@router.patch(
    "/connectors/{connector_id}/price",
    response_model=schemas.ManagedConnectorRead,
)
def change_connector_price(
    connector_id: str,
    payload: schemas.ConnectorPriceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        management.update_connector_price,
        db,
        current_user.id,
        connector_id,
        payload,
    )


@router.patch(
    "/connectors/{connector_id}/status",
    response_model=schemas.ManagedConnectorRead,
)
def change_connector_status(
    connector_id: str,
    payload: schemas.ConnectorStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return _execute(
        management.update_connector_status,
        db,
        current_user.id,
        connector_id,
        payload,
    )

@router.post(
    "/plan",
    response_model=schemas.ChargePlanIntentRead,
)
async def read_charge_plan(
    payload: schemas.ChargePlanIntentRequest,
    current_user: User = Depends(
        get_current_active_user
    ),
):
    return await _execute_async(
        advisor.parse_charge_plan,
        current_user.id,
        payload,
    )
