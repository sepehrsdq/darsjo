from django.contrib import admin

from .models import ClassRoom, Enrollment, Offering, ScheduleSlot, Subject


class ScheduleInline(admin.TabularInline):
    model = ScheduleSlot
    extra = 0


@admin.register(ClassRoom)
class ClassRoomAdmin(admin.ModelAdmin):
    list_display = ("name", "grade", "year")
    list_filter = ("year", "grade")
    search_fields = ("name",)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("title", "color")


@admin.register(Offering)
class OfferingAdmin(admin.ModelAdmin):
    list_display = ("subject", "class_room", "teacher", "year", "is_active")
    list_filter = ("year", "is_active", "subject")
    search_fields = ("subject__title", "teacher__last_name")
    inlines = [ScheduleInline]


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("student", "class_room", "year", "is_active")
    list_filter = ("year", "is_active")
    search_fields = ("student__last_name", "student__username")
