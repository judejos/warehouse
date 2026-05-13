from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Supplier
from vendors.models import Vendor

@receiver(post_save, sender=Supplier)
def mirror_supplier_to_vendor(sender, instance, created, **kwargs):
    # Try to find a vendor by email or vendor_name
    vendor = None
    if instance.email:
        vendor = Vendor.objects.filter(email=instance.email.strip().lower()).first()
    if not vendor:
        vendor = Vendor.objects.filter(vendor_name__iexact=instance.supplier_name.strip()).first()
    
    if not vendor:
        # Create new vendor
        Vendor.objects.create(
            vendor_name=instance.supplier_name.strip(),
            contact_person=instance.contact_personname or "",
            email=instance.email.strip().lower() if instance.email else None,
            phone=instance.phone or "",
            address=instance.address or "",
            city=instance.city or "",
            state=instance.state or "",
            country=instance.country or "",
            is_active=instance.is_active
        )
    else:
        # Update existing vendor
        vendor.vendor_name = instance.supplier_name.strip()
        if instance.contact_personname:
            vendor.contact_person = instance.contact_personname
        if instance.email:
            vendor.email = instance.email.strip().lower()
        if instance.phone:
            vendor.phone = instance.phone
        if instance.address:
            vendor.address = instance.address
        if instance.city:
            vendor.city = instance.city
        if instance.state:
            vendor.state = instance.state
        if instance.country:
            vendor.country = instance.country
        vendor.is_active = instance.is_active
        vendor.save()
