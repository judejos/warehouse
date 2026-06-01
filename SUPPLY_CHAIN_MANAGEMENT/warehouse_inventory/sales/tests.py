from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from rbac.models import Role, UserRole
from products.models import Product
from sales.models import CustomerPurchaseRequest, SalesOrder, SOPayment

User = get_user_model()

class SalesWorkflowTestCase(APITestCase):
    def setUp(self):
        # 1. Create Roles
        self.sales_manager_role, _ = Role.objects.get_or_create(name="sales_manager")
        self.inventory_manager_role, _ = Role.objects.get_or_create(name="inventory_manager")
        self.supervisor_role, _ = Role.objects.get_or_create(name="supervisor")
        self.finance_director_role, _ = Role.objects.get_or_create(name="finance_director")
        self.quality_assistant_role, _ = Role.objects.get_or_create(name="quality_assistant")

        # 2. Create Users
        self.sales_manager_user = User.objects.create_user(
            username="sales_mgr", email="sales@test.com", password="password123"
        )
        UserRole.objects.create(
            employee_id="EMP0001", user=self.sales_manager_user, role=self.sales_manager_role, is_first_login=False
        )

        self.inventory_manager_user = User.objects.create_user(
            username="inv_mgr", email="inv@test.com", password="password123"
        )
        UserRole.objects.create(
            employee_id="EMP0002", user=self.inventory_manager_user, role=self.inventory_manager_role, is_first_login=False
        )

        self.supervisor_user = User.objects.create_user(
            username="super", email="super@test.com", password="password123"
        )
        UserRole.objects.create(
            employee_id="EMP0003", user=self.supervisor_user, role=self.supervisor_role, is_first_login=False
        )

        self.finance_director_user = User.objects.create_user(
            username="fin_dir", email="fin@test.com", password="password123"
        )
        UserRole.objects.create(
            employee_id="EMP0004", user=self.finance_director_user, role=self.finance_director_role, is_first_login=False
        )

        self.quality_assistant_user = User.objects.create_user(
            username="qual_asst", email="qual@test.com", password="password123"
        )
        UserRole.objects.create(
            employee_id="EMP0005", user=self.quality_assistant_user, role=self.quality_assistant_role, is_first_login=False
        )

        # 3. Create Product (using auto barcode generated SKU or arbitrary)
        self.product = Product.objects.create(
            product_name="Orange Juice",
            brand_name="FruitCo",
            barcode="888888888",
            conversion_factor=1,
            carton_price=100.0,
        )

        # Clients for specific users
        self.sales_mgr_client = APIClient()
        self.sales_mgr_client.force_authenticate(user=self.sales_manager_user)

        self.inv_mgr_client = APIClient()
        self.inv_mgr_client.force_authenticate(user=self.inventory_manager_user)

        self.supervisor_client = APIClient()
        self.supervisor_client.force_authenticate(user=self.supervisor_user)

        self.fin_dir_client = APIClient()
        self.fin_dir_client.force_authenticate(user=self.finance_director_user)

        self.qual_asst_client = APIClient()
        self.qual_asst_client.force_authenticate(user=self.quality_assistant_user)

    def test_complete_outbound_workflow(self):
        # --- Step 1: Create CPR ---
        cpr_data = {
            "customer_name": "Acme Corp",
            "customer_phone": "+919999999999",
            "customer_email": "acme@example.com",
            "customer_address": "123 Industrial Area, Phase 1",
            "customer_gstin": "07AAAAA0000A1Z1",
            "product": self.product.product_id,
            "requested_quantity": 50,
            "unit_price": 120.00,
            "notes": "Urgent delivery request"
        }

        # Quality assistant cannot create CPR
        response = self.qual_asst_client.post("/api/sales/cpr/", cpr_data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Sales Manager can create CPR
        response = self.sales_mgr_client.post("/api/sales/cpr/", cpr_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        cpr_id = response.data["cpr_id"]
        self.assertEqual(response.data["status"], "Pending")
        self.assertEqual(float(response.data["total_amount"]), 6000.00)

        # --- Step 2: CPR Stock Confirmation by Inventory Manager ---
        action_data = {
            "action": "confirm",
            "notes": "Enough stock is available in Zone A"
        }

        # Sales manager cannot confirm stock
        response = self.sales_mgr_client.patch(f"/api/sales/cpr/{cpr_id}/inventory-action/", action_data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Inventory manager can confirm stock
        response = self.inv_mgr_client.patch(f"/api/sales/cpr/{cpr_id}/inventory-action/", action_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Stock Confirmed")

        # --- Step 3: Create Sales Order ---
        so_data = {
            "cpr": cpr_id
        }

        # Quality assistant cannot create Sales Order
        response = self.qual_asst_client.post("/api/sales/so/", so_data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Sales Manager can create Sales Order from Confirmed CPR
        response = self.sales_mgr_client.post("/api/sales/so/", so_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        so_id = response.data["so_id"]
        self.assertEqual(response.data["status"], "Pending Supervisor")

        # Cannot create multiple SOs for the same CPR
        response = self.sales_mgr_client.post("/api/sales/so/", so_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # --- Step 4: Supervisor Approval ---
        approval_data = {
            "action": "approve",
            "notes": "Approved for dispatch processing"
        }

        # Sales manager cannot approve
        response = self.sales_mgr_client.patch(f"/api/sales/so/{so_id}/supervisor-action/", approval_data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Supervisor can approve
        response = self.supervisor_client.patch(f"/api/sales/so/{so_id}/supervisor-action/", approval_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Supervisor Approved")

        # --- Step 5: Record Payment ---
        payment_data = {
            "payment_type": "advance",
            "amount_received": 2000.00,
            "payment_notes": "Received ₹2000 via NEFT"
        }

        # Quality assistant cannot record payment
        response = self.qual_asst_client.post(f"/api/sales/so/{so_id}/payment/", payment_data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Sales Manager can record payment
        response = self.sales_mgr_client.post(f"/api/sales/so/{so_id}/payment/", payment_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(float(response.data["balance_due"]), 4000.00)
        self.assertEqual(response.data["finance_confirmed"], False)

        # SO status should be Payment Pending now
        so = SalesOrder.objects.get(so_id=so_id)
        self.assertEqual(so.status, "Payment Pending")

        # --- Step 6: Finance Director Confirm Payment ---
        confirm_data = {
            "finance_notes": "NEFT transaction cleared in bank"
        }

        # Sales manager cannot confirm payment
        response = self.sales_mgr_client.patch(f"/api/sales/so/{so_id}/finance-confirm/", confirm_data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Finance Director can confirm payment
        response = self.fin_dir_client.patch(f"/api/sales/so/{so_id}/finance-confirm/", confirm_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Finance Confirmed")

        # --- Step 7: Pick & Pack / Dispatch by Inventory Manager ---
        # Quality assistant cannot start Pick & Pack
        response = self.qual_asst_client.post(f"/api/sales/so/{so_id}/pick-pack/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Inventory manager can start Pick & Pack
        response = self.inv_mgr_client.post(f"/api/sales/so/{so_id}/pick-pack/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Pick & Pack")

        # Inventory manager can dispatch
        response = self.inv_mgr_client.post(f"/api/sales/so/{so_id}/dispatch/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Dispatched")
