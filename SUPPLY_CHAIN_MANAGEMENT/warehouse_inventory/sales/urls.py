from django.urls import path
from .views import (
    CPRListCreateView,
    CPRInventoryActionView,
    SOListCreateView,
    SOSupervisorActionView,
    SOPaymentView,
    SOFinanceConfirmView,
    SODispatchView,
    SOPickPackView,
    SOPaymentListView,
)

urlpatterns = [
    # ── Customer Purchase Request ──────────────────────────────────────────
    path("cpr/",                              CPRListCreateView.as_view(),      name="cpr-list-create"),
    path("cpr/<str:cpr_id>/inventory-action/", CPRInventoryActionView.as_view(), name="cpr-inventory-action"),

    # ── Sales Order ────────────────────────────────────────────────────────
    path("so/",                                SOListCreateView.as_view(),       name="so-list-create"),
    path("so/<str:so_id>/supervisor-action/",  SOSupervisorActionView.as_view(), name="so-supervisor-action"),
    path("so/<str:so_id>/payment/",            SOPaymentView.as_view(),          name="so-payment"),
    path("so/<str:so_id>/finance-confirm/",    SOFinanceConfirmView.as_view(),   name="so-finance-confirm"),
    path("so/<str:so_id>/pick-pack/",          SOPickPackView.as_view(),         name="so-pick-pack"),
    path("so/<str:so_id>/dispatch/",           SODispatchView.as_view(),         name="so-dispatch"),

    # ── Payments ───────────────────────────────────────────────────────────
    path("payments/",                          SOPaymentListView.as_view(),      name="payment-list"),
]
