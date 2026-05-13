from django.db import models


class Supplier(models.Model):

    supplier_id = models.CharField(
        primary_key=True,
        max_length=10,
        editable=False
    )

    supplier_name = models.CharField(max_length=255)

    contact_personname = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )

    email = models.EmailField(
        blank=True,
        null=True
    )

    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True
    )

    address = models.TextField(
        blank=True,
        null=True
    )

    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    country = models.CharField(max_length=100)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "supplier"
        ordering = ["supplier_name"]

    def save(self, *args, **kwargs):

        if not self.supplier_id:
            last_supplier = Supplier.objects.order_by('-supplier_id').first()

            if last_supplier:
                last_id = int(last_supplier.supplier_id[3:])
                new_id = last_id + 1
            else:
                new_id = 1

            self.supplier_id = f"SUP{new_id:04d}"

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.supplier_id} - {self.supplier_name}"

from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=Supplier)
def sync_supplier_to_vendor(sender, instance, created, **kwargs):
    """Automatically sync Supplier records to Vendor table for procurement integration."""
    try:
        from vendors.models import Vendor
        # Match by name or email
        vendor = None
        if instance.email:
            vendor = Vendor.objects.filter(email=instance.email).first()
        
        if not vendor:
            vendor = Vendor.objects.filter(vendor_name=instance.supplier_name).first()

        vendor_data = {
            "vendor_name":    instance.supplier_name,
            "contact_person": instance.contact_personname or "",
            "email":          instance.email,
            "phone":          instance.phone or "",
            "address":        instance.address or "",
            "city":           instance.city or "",
            "state":          instance.state or "",
            "country":        instance.country or "India",
            "is_active":      instance.is_active,
        }

        if not vendor:
            Vendor.objects.create(**vendor_data)
        else:
            for key, value in vendor_data.items():
                setattr(vendor, key, value)
            vendor.save()
    except Exception as e:
        # Prevent sync errors from breaking the main supplier save
        import logging
        logging.getLogger(__name__).error(f"Supplier-Vendor sync failed: {e}")