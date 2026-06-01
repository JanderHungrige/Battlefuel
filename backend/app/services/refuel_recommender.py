"""The refuel recommender seam (Wave 5 Feature 3: refuel-orders).

``RefuelRecommender`` chooses which fuel truck should service a thirsty unit and where they
should meet. Wave 5 ships ``NearestRefuelRecommender`` (closest fuelled truck by great-circle
distance). The full optimization algorithm is **Wave 6**: it registers a new recommender
(``settings.refuel_recommender = "ortools"``) — it does not edit this placeholder. Any extra
context an optimizer needs (depots, sim clock) is injected through its constructor so the
``recommend(unit, trucks)`` signature and the ``RefuelRecommendation`` return type stay stable.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from app.config import Settings, get_settings
from app.domain.refuel import RefuelRecommendation, Rendezvous
from app.domain.unit_instance import UnitInstance
from app.services.sim import haversine_m


class RefuelRecommender(ABC):
    @abstractmethod
    def recommend(
        self, unit: UnitInstance, trucks: Sequence[UnitInstance]
    ) -> RefuelRecommendation | None:
        """Choose a truck + rendezvous for ``unit``, or ``None`` if no truck can serve it.

        ``trucks`` are pre-filtered candidates (FUEL_SUPPLY, matching fuel type). Returning a
        recommendation does NOT dispatch the truck — the operator moves it manually.
        """


class NearestRefuelRecommender(RefuelRecommender):
    """Placeholder heuristic: the closest candidate truck that still carries fuel.

    Rendezvous is the unit's own position — transfer requires identical position, so the
    truck comes to the unit. ``score``/``rationale`` are left empty (the Wave-6 optimizer
    fills them).
    """

    def recommend(
        self, unit: UnitInstance, trucks: Sequence[UnitInstance]
    ) -> RefuelRecommendation | None:
        fuelled = [t for t in trucks if (t.current_fuel_liters or 0.0) > 0.0]
        if not fuelled:
            return None
        nearest = min(fuelled, key=lambda t: haversine_m(unit.lon, unit.lat, t.lon, t.lat))
        return RefuelRecommendation(
            truck_id=nearest.id,
            rendezvous=Rendezvous(lat=unit.lat, lon=unit.lon, h3_index=unit.h3_index),
        )


RecommenderBuilder = Callable[[], RefuelRecommender]
_REGISTRY: dict[str, RecommenderBuilder] = {}


class UnknownRecommenderError(ValueError):
    """Raised when config names a refuel recommender that is not registered."""


def register_refuel_recommender(name: str, builder: RecommenderBuilder) -> None:
    _REGISTRY[name] = builder


def build_refuel_recommender(settings: Settings | None = None) -> RefuelRecommender:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.refuel_recommender]
    except KeyError as exc:
        raise UnknownRecommenderError(
            f"unknown refuel recommender {settings.refuel_recommender!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_refuel_recommender("nearest", NearestRefuelRecommender)
