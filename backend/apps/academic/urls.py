from rest_framework.routers import DefaultRouter

from .views import ClassRoomViewSet, EnrollmentViewSet, OfferingViewSet, SubjectViewSet

router = DefaultRouter(trailing_slash=False)
router.register("subjects", SubjectViewSet, basename="subject")
router.register("classes", ClassRoomViewSet, basename="class")
router.register("offerings", OfferingViewSet, basename="offering")
router.register("enrollments", EnrollmentViewSet, basename="enrollment")

urlpatterns = router.urls
