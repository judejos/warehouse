from django.test import TestCase
from unittest.mock import patch
from .services import SupplierService
from .models import Supplier

class SupplierEmailFailureTest(TestCase):
    @patch('supplier.services.send_mail')
    def test_supplier_creation_with_email_failure(self, mock_send_mail):
        # Setup mock to raise an exception when sending email
        mock_send_mail.side_effect = Exception("SMTP daily limit exceeded")
        
        data = {
            "supplier_name": "Test Supplier",
            "contact_personname": "John Doe",
            "email": "john@testsupplier.com",
            "phone": "1234567890",
            "address": "123 Test St",
            "city": "Testville",
            "state": "TS",
            "country": "Testland",
            "is_active": True
        }
        
        # This should execute without raising an error because the email failure is caught/silenced
        supplier = SupplierService.create_supplier(data)
        
        self.assertIsNotNone(supplier)
        self.assertEqual(supplier.supplier_name, "Test Supplier")
        self.assertTrue(Supplier.objects.filter(supplier_id=supplier.supplier_id).exists())
        
        # Verify that send_mail was called
        mock_send_mail.assert_called_once()
