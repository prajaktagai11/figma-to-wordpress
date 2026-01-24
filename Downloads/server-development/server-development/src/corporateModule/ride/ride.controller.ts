import { Request, Response, NextFunction, query } from "express";
import { VehicleCategoryModel } from "../../appModule/vehicle/models/vehicleCategory.model";
import {
  VehicleChargeModel,
  RideType as ChargeType,
} from "../../adminModule/fleetOwner/models/vehicleCharge.model";
import { FleetOwnerModel } from "../../adminModule/fleetOwner/models/fleetOwner.model";
import { CustomerModel } from "../../appModule/customer/customer.model";
import { CustomerRideDetailModel } from "../../appModule/ride/models/customerRideDetail.model";
import {
  CorporateRideType,
  Ride,
  RideModel,
  RideStatus,
  RideTransactionStatus,
  RideType,
} from "../../appModule/ride/models/ride.model";
import { geocoder } from "../../utils/geocoder";
import { createTransaction } from "../../appModule/transaction/transaction.controller";
import {
  TransactionMedium,
  TransactionStatus,
} from "../../appModule/transaction/transaction.model";
import { CorporateModel } from "../../adminModule/corporate/models/corporate.model";
import { NotificationType } from "../../notificationModule/notification";
import {
  sendPushNotificationToPreviousFCM,
  sendPushNotificationToNewFCM,
} from "../../notificationModule/notification.controller";
import { UserRole } from "../../utils/common/commonClasses";
import { generateRandomNumber } from "../../utils/common/commonFunction";
import { CorporateCreditModel } from "../../adminModule/corporate/models/corporateCredit.model";
const axios = require("axios").default;

// ==================== START: Changed by Prajakta - Timeout Utility Functions ====================
// Added timeout wrapper to prevent long-running operations from causing 504 errors
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

// Geocoding with fallback - prevents 504 timeout when geocoding service is slow
const geocodeWithFallback = async (location: any, type: string = 'location') => {
  try {
    const loc = await withTimeout(
      geocoder.reverse({
        lat: location.lat || location.latitude,
        lon: location.lng || location.longitude,
      }),
      8000  // 8 second timeout for geocoding
    );

    const result = Array.isArray(loc) && loc.length > 0 ? loc[0] : null;

    if (!result) {
      throw new Error('No geocoding result');
    }

    return {
      fullAddress: result.formattedAddress || `${location.lat}, ${location.lng}`,
      landmark: "",
      pincode: result.zipcode || "",
      city: result.city || "",
      state: result.administrativeLevels?.level1long || "",
      location: {
        type: "Point",
        coordinates: [
          location.lng || location.longitude,
          location.lat || location.latitude
        ],
      },
    };
  } catch (error) {
    console.error(`Geocoding ${type} failed:`, error.message);

    // Fallback: use coordinates directly if geocoding fails
    return {
      fullAddress: `${location.lat || location.latitude}, ${location.lng || location.longitude}`,
      landmark: "",
      pincode: "",
      city: "",
      state: "",
      location: {
        type: "Point",
        coordinates: [
          location.lng || location.longitude,
          location.lat || location.latitude
        ],
      },
    };
  }
};
// ==================== END: Changed by Prajakta - Timeout Utility Functions ====================

export const createRide = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    let {
      autoPaid,
      user,
      userRole,
      corporate,
      customer,
      fleetOwner,
      bookingDateTime,
      pickupLocation,
      dropOffLocation,
      note = "",
      type = "One Way",
      estimatedAmount = 0,
      paidAmount = 0,
      estimatedTripDuration,
      estimatedKm,
      vehicleCategory,
      corporateRideType,
    } = req.body;

    // ==================== START: Changed by Prajakta - Added timeout to vehicle charge query ====================
    let vehicleCharge = await VehicleChargeModel.findOne({
      fleetOwner: fleetOwner,
      rideType: ChargeType.ONEWAY,
      vehicleCategory,
    }).maxTimeMS(5000);  // Added 5 second timeout
    // ==================== END: Changed by Prajakta ====================

    if (vehicleCharge == null) {
      return res.status(200).json({
        success: false,
        message: "No charges set for this category vehicle by fleetowner",
      });
    }

    // ==================== START: Changed by Prajakta - Moved credit check to top for early validation ====================
    // Check credit BEFORE expensive geocoding operations to fail fast
    let fleetOwnerCredit = await CorporateCreditModel.findOne({
      fleetOwner: fleetOwner
    }).maxTimeMS(5000);  // Added 5 second timeout

    if (fleetOwnerCredit == null) {
      return res.status(200).json({
        success: false,
        message: "No Credit set by fleetowner",
      });
    }
    // ==================== END: Changed by Prajakta ====================

    let transaction: any;
    let autoPaidByCorporate = Boolean(autoPaid);
    pickupLocation = JSON.parse(pickupLocation);
    dropOffLocation = JSON.parse(dropOffLocation);
    bookingDateTime = new Date(bookingDateTime);

    if (type == RideType.OUTSTATION && paidAmount > 0) {
      transaction = await createTransaction(
        customer,
        fleetOwner,
        paidAmount,
        TransactionMedium.RAZORPAY,
        TransactionStatus.PENDING
      );
    }

    // ==================== START: Old code - Commented by Prajakta ====================
    // Old geocoding code - caused 504 timeout (30+ seconds, no timeout protection)
    /*
    let customerLocationIds: any = [];
    if (pickupLocation != null) {
      const loc = await geocoder.reverse({
        lat: pickupLocation["lat"],
        lon: pickupLocation["lng"],
      });
      console.log(loc);
      var city = loc[0]["city"];
      var state = loc[0]["administrativeLevels"]["level1long"];
      var pincode = loc[0]["zipcode"];
      var fullAddress = loc[0]["formattedAddress"];

      pickupLocation = {
        fullAddress: fullAddress,
        landmark: "",
        pincode,
        city,
        state,
        location: {
          type: "Point",
          coordinates: [pickupLocation["lng"], pickupLocation["lat"]],
        },
      };
    }
    if (dropOffLocation != null) {
      const loc = await geocoder.reverse({
        lat: dropOffLocation["lat"],
        lon: dropOffLocation["lng"],
      });
      console.log(loc);
      var city = loc[0]["city"];
      var state = loc[0]["administrativeLevels"]["level1long"];
      var pincode = loc[0]["zipcode"];
      var fullAddress = loc[0]["formattedAddress"];

      dropOffLocation = [
        {
          fullAddress: fullAddress,
          landmark: "",
          pincode,
          city,
          state,
          location: {
            type: "Point",
            coordinates: [dropOffLocation["lng"], dropOffLocation["lat"]],
          },
        },
      ];
    }
    */
    // ==================== END: Old code - Commented by Prajakta ====================

    // ==================== START: Changed by Prajakta - Parallel geocoding with timeout ====================
    // Run both geocoding operations in PARALLEL with timeout and fallback
    const [geocodedPickup, geocodedDropoff] = await Promise.all([
      pickupLocation != null ? geocodeWithFallback(pickupLocation, 'pickup') : null,
      dropOffLocation != null ? geocodeWithFallback(dropOffLocation, 'dropoff') : null,
    ]);

    pickupLocation = geocodedPickup;
    dropOffLocation = geocodedDropoff ? [geocodedDropoff] : [];

    let customerLocationIds: any = [];
    // ==================== END: Changed by Prajakta ====================

    // ==================== START: Old code - Commented by Prajakta ====================
    // Old sequential database operations - slow, no batch insert
    /*
    let customerIds: any = [];

    for (let i = 0; i < dropOffLocation.length; i++) {
      const address = dropOffLocation[i];

      let locationDetailQuery: any = {
        customer,
        corporate,
        pickupLocation: i == 0 ? pickupLocation : dropOffLocation[i - 1],
        dropOffLocation: address,
        bookingDateTime,
        fleetOwner,
      };

      customerIds.push(customer);

      let rideLocationDetails = await CustomerRideDetailModel.create(
        locationDetailQuery
      );
      customerLocationIds.push(rideLocationDetails._id);
    }
    */
    // ==================== END: Old code - Commented by Prajakta ====================

    // ==================== START: Changed by Prajakta - Batch database operations ====================
    // Batch insert instead of sequential creates - much faster
    let customerIds: any = [];
    let locationDetailsToCreate = [];

    for (let i = 0; i < dropOffLocation.length; i++) {
      const address = dropOffLocation[i];

      let locationDetailQuery: any = {
        customer,
        corporate,
        pickupLocation: i == 0 ? pickupLocation : dropOffLocation[i - 1],
        dropOffLocation: address,
        bookingDateTime,
        fleetOwner,
      };

      customerIds.push(customer);
      locationDetailsToCreate.push(locationDetailQuery);
    }

    // Batch insert all at once
    const rideLocationDetails = await CustomerRideDetailModel.insertMany(
      locationDetailsToCreate
    );
    customerLocationIds = (rideLocationDetails as unknown as any[]).map((detail: any) => detail._id);
    // ==================== END: Changed by Prajakta ====================

    // ==================== START: Changed by Prajakta - Added timeout and optimized query ====================
    if (vehicleCharge != null) {
      let fleetOwnerData = await FleetOwnerModel.findById(fleetOwner)
        .select('peakHourTime')  // Only fetch needed field
        .maxTimeMS(5000);  // Added 5 second timeout

      if (fleetOwnerData != null) {
        let date = new Date(bookingDateTime);
        let index = -1;
        var time = parseFloat(`${date!.getHours()}.${date!.getMinutes()}`);
        for (var i = 0; i < fleetOwnerData.peakHourTime.length; i++) {
          if (
            time >= fleetOwnerData.peakHourTime[i].startTime &&
            time < fleetOwnerData.peakHourTime[i].endTime
          ) {
            index = i;
          }
        }
        estimatedAmount =
          estimatedKm *
          (index == -1
            ? vehicleCharge.normalRate
            : vehicleCharge.peakHourTimeRate);
      }
    }
    // ==================== END: Changed by Prajakta ====================

    // ==================== START: Old code - Commented by Prajakta ====================
    // Old credit check - was too late in the flow (after slow operations)
    /*
    let fleetOwnerCredit = await CorporateCreditModel.findOne({ fleetOwner: fleetOwner });
    if (fleetOwnerCredit == null) {
      return res.status(200).json({
        success: false,
        message: "No Credit set by fleetowner",
      });
    } else {
      if (fleetOwnerCredit.balanceCredit < estimatedAmount) {
        return res.status(200).json({
          success: false,
          message: "Insufficient Credit balance",
        });
      }
    }
    */
    // ==================== END: Old code - Commented by Prajakta ====================

    // ==================== START: Changed by Prajakta - Credit balance check (credit existence already checked at top) ====================
    // Check credit balance (credit existence already validated at the top)
    if (fleetOwnerCredit.balanceCredit < estimatedAmount) {
      return res.status(200).json({
        success: false,
        message: "Insufficient Credit balance",
      });
    }
    // ==================== END: Changed by Prajakta ====================

    let rideQuery: any = {
      customer: customerIds,
      autoPaidByCorporate,
      fleetOwner,
      bookingDateTime,
      note,
      corporate,
      isSharedRide:
        corporateRideType != null && corporateRideType != undefined
          ? true
          : false,
      corporateRideType:
        corporateRideType != null && corporateRideType != undefined
          ? corporateRideType
          : CorporateRideType.INDIVIDUAL,
      isCorporate: true,
      customerRideDetails: customerLocationIds,
      type,
      estimatedTripDuration,
      totalTripDuration: estimatedTripDuration,
      estimatedAmount,
      totalAmount: estimatedAmount,
      paidAmount,
      estimatedKm,
      totalKm: estimatedKm,
      otp: generateRandomNumber(1000, 9999),
      createdBy: "Corporate",
      transaction:
        type != RideType.OUTSTATION || paidAmount == 0
          ? []
          : [transaction!._id],
      transactionStatus: RideTransactionStatus.PENDING,
      vehicleCategory,
      rideStatus:
        userRole == UserRole.CORPORATE || userRole == "CORPORATE"
          ? RideStatus.FLEETOWNERAPPROVALPENDING
          : RideStatus.CORPORATEAPPROVALPENDING,
    };

    if (userRole == UserRole.FLEETOWNER) {
      rideQuery["milestones"] = { "Ride accepted": new Date() };
    }

    let ride: any = await RideModel.create(rideQuery);

    if (transaction != null) {
      transaction.ride = ride._id;
      await transaction.save();
    }

    await CustomerRideDetailModel.updateMany(
      { _id: { $in: customerLocationIds } },
      { $set: { ride: ride._id } }
    );

    // ==================== START: Changed by Prajakta - Added timeout to populate query ====================
    ride = await RideModel.findById(ride._id)
      .maxTimeMS(10000)  // Added 10 second timeout
      .populate({
        path: "customer",
        select: "fullName avatar phone email fcmTokens",
      })
      .populate({
        path: "driver",
        select:
          "fullName avatar phone email license rating createdAt fcmTokens",
      })
      .populate({
        path: "vehicle",
        select: "image name registrationNo noOfSeats odo createdAt category",
        populate: { path: "category" },
      })
      .populate({ path: "corporate" })
      .populate({ path: "vehicleCategory", select: "name image" })
      .populate({
        path: "customerRideDetails",
        populate: {
          path: "customer",
          select: "fullName phone countryCode email avatar",
        },
      });
    // ==================== END: Changed by Prajakta ====================

    if (ride) {
      let receivers: any = {};
      let titleAndBody: any = {};
      let senderName;

      // ==================== START: Changed by Prajakta - Optimized notification queries with timeout ====================
      const corporateEntity = await CorporateModel.findById(corporate)
        .select('fullName')  // Only fetch needed field
        .maxTimeMS(3000);  // Added 3 second timeout

      if (corporateEntity) {
        receivers.fleetOwner = ride.fleetOwner;

        senderName = corporateEntity.fullName;

        titleAndBody.title = `Individual Corporate Ride`;
        titleAndBody.body = `${corporateEntity.fullName} has requested for a ride`;

        let fcmTokens: any = [];
        const fleetOwnerModel = await FleetOwnerModel.findById(fleetOwner)
          .select('fcmTokens')  // Only fetch needed field
          .maxTimeMS(3000);  // Added 3 second timeout
        if (fleetOwnerModel) fcmTokens = fleetOwnerModel.fcmTokens;
      // ==================== END: Changed by Prajakta ====================

        let notificationDetails = {
          notification: titleAndBody,
          fcmTokens: fcmTokens,
          data: {
            featureId: ride._id,
            type: NotificationType.RIDE,
          },
          featureId: ride._id,
          notificationtype: NotificationType.RIDE,
          notificationData: {},
          ...titleAndBody,
          remarks: "",
          ...receivers,
          thumbnail: "",
          avatar: "",
          senderName: senderName,
        };

        sendPushNotificationToPreviousFCM(notificationDetails);
        sendPushNotificationToNewFCM(notificationDetails);
        // createNotification(notificationDetails);
      }
    }

    return res.status(200).json({
      success: true,
      result: ride,
    });
  } catch (error) {
    console.error('createRide error:', error);
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// Note: Apply similar changes to createGroupRide function below
export const createGroupRide = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  // TODO: Apply same timeout and optimization changes as createRide
  // This function has similar issues and should be updated
  try {
    let {
      autoPaid,
      user,
      userRole,
      corporate,
      fleetOwner,
      bookingDateTime,
      note = "",
      type = "One Way",
      estimatedAmount = 0,
      paidAmount = 0,
      estimatedTripDuration,
      estimatedKm,
      vehicleCategory,
      corporateRideType,
      grpDetail,
      customerIds,
    } = req.body;

    // ==================== START: Changed by Prajakta - Added timeout ====================
    let vehicleCharge = await VehicleChargeModel.findOne({
      fleetOwner: fleetOwner,
      rideType: ChargeType.ONEWAY,
      vehicleCategory,
    }).maxTimeMS(5000);
    // ==================== END: Changed by Prajakta ====================

    if (vehicleCharge == null) {
      return res.status(200).json({
        success: false,
        message: "No charges set for this category vehicle by fleetowner",
      });
    }

    // ==================== START: Changed by Prajakta - Early credit check ====================
    let fleetOwnerCredit = await CorporateCreditModel.findOne({
      fleetOwner: fleetOwner
    }).maxTimeMS(5000);

    if (fleetOwnerCredit == null) {
      return res.status(200).json({
        success: false,
        message: "No Credit set by fleetowner",
      });
    }
    // ==================== END: Changed by Prajakta ====================

    let transaction: any;
    let autoPaidByCorporate = Boolean(autoPaid);
    grpDetail = JSON.parse(grpDetail);
    customerIds = JSON.parse(customerIds);

    if (type == RideType.OUTSTATION && paidAmount > 0) {
      // transaction creation code
    }

    let customerLocationIds: any = [];

    // TODO: Apply geocodeWithFallback here similar to createRide
    for (let index = 0; index < grpDetail.length; index++) {
      const element = grpDetail[index];

      // Geocoding code - should be optimized with timeout similar to createRide
      if (element["pickupLocation"] != null) {
        const loc = await geocoder.reverse({
          lat: element["pickupLocation"]["lat"],
          lon: element["pickupLocation"]["lng"],
        });
        console.log(loc);
        var city = loc[0]["city"];
        var state = loc[0]["administrativeLevels"]["level1long"];
        var pincode = loc[0]["zipcode"];
        var fullAddress = loc[0]["formattedAddress"];
        element["pickupLocation"] = {
          fullAddress: fullAddress,
          landmark: "",
          pincode,
          city,
          state,
          location: {
            type: "Point",
            coordinates: [
              element["pickupLocation"]["lng"],
              element["pickupLocation"]["lat"],
            ],
          },
        };
      }
      if (element["dropOffLocation"] != null) {
        const loc = await geocoder.reverse({
          lat: element["dropOffLocation"]["lat"],
          lon: element["dropOffLocation"]["lng"],
        });
        console.log(loc);
        var city = loc[0]["city"];
        var state = loc[0]["administrativeLevels"]["level1long"];
        var pincode = loc[0]["zipcode"];
        var fullAddress = loc[0]["formattedAddress"];
        element["dropOffLocation"] = [
          {
            fullAddress: fullAddress,
            landmark: "",
            pincode,
            city,
            state,
            location: {
              type: "Point",
              coordinates: [
                element["dropOffLocation"]["lng"],
                element["dropOffLocation"]["lat"],
              ],
            },
          },
        ];
      }

      for (let i = 0; i < element["dropOffLocation"].length; i++) {
        const address = element["dropOffLocation"][i];
        let locationDetailQuery: any = {
          customer: element["customerId"],
          corporate,
          pickupLocation:
            i == 0
              ? element["pickupLocation"]
              : element["dropOffLocation"][i - 1],
          dropOffLocation: address,
          bookingDateTime: element["bookingDateTime"],
          fleetOwner,
          autoPaidByCorporate,
        };
        let rideLocationDetails = await CustomerRideDetailModel.create(
          locationDetailQuery
        );
        customerLocationIds.push(rideLocationDetails._id);
      }
    }

    // ==================== START: Changed by Prajakta - Added timeout ====================
    if (vehicleCharge != null) {
      let fleetOwnerData = await FleetOwnerModel.findById(fleetOwner)
        .select('peakHourTime')
        .maxTimeMS(5000);

      if (fleetOwnerData != null) {
        let date = new Date(bookingDateTime);
        let index = -1;
        var time = parseFloat(`${date!.getHours()}.${date!.getMinutes()}`);
        for (var i = 0; i < fleetOwnerData.peakHourTime.length; i++) {
          if (
            time >= fleetOwnerData.peakHourTime[i].startTime &&
            time < fleetOwnerData.peakHourTime[i].endTime
          ) {
            index = i;
          }
        }
        estimatedAmount =
          estimatedKm *
          (index == -1
            ? vehicleCharge.normalRate
            : vehicleCharge.peakHourTimeRate);
      }
    }
    // ==================== END: Changed by Prajakta ====================

    // Credit balance check
    if (fleetOwnerCredit.balanceCredit < estimatedAmount) {
      return res.status(200).json({
        success: false,
        message: "Insufficient Credit balance",
      });
    }

    let rideQuery: any = {
      customer: customerIds,
      fleetOwner,
      bookingDateTime,
      note,
      corporate,
      autoPaidByCorporate,
      isSharedRide:
        corporateRideType != null && corporateRideType != undefined
          ? true
          : false,
      corporateRideType:
        corporateRideType != null && corporateRideType != undefined
          ? corporateRideType
          : CorporateRideType.INDIVIDUAL,
      isCorporate: true,
      customerRideDetails: customerLocationIds,
      type,
      estimatedTripDuration,
      totalTripDuration: estimatedTripDuration,
      estimatedAmount,
      totalAmount: estimatedAmount,
      paidAmount,
      estimatedKm,
      totalKm: estimatedKm,
      otp: generateRandomNumber(1000, 9999),
      createdBy: "Corporate",
      transaction:
        type != RideType.OUTSTATION || paidAmount == 0
          ? []
          : [transaction!._id],
      transactionStatus: RideTransactionStatus.PENDING,
      vehicleCategory,
      rideStatus:
        userRole == UserRole.CORPORATE || userRole == "CORPORATE"
          ? RideStatus.FLEETOWNERAPPROVALPENDING
          : RideStatus.CORPORATEAPPROVALPENDING,
    };

    if (userRole == UserRole.FLEETOWNER) {
      rideQuery["milestones"] = { "Ride accepted": new Date() };
    }

    let ride: any = await RideModel.create(rideQuery);

    if (transaction != null) {
      transaction.ride = ride._id;
      await transaction.save();
    }

    await CustomerRideDetailModel.updateMany(
      { _id: { $in: customerLocationIds } },
      { $set: { ride: ride._id } }
    );

    ride = await RideModel.findById(ride._id)
      .maxTimeMS(10000)
      .populate({
        path: "customer",
        select: "fullName avatar phone email fcmTokens",
      })
      .populate({
        path: "driver",
        select:
          "fullName avatar phone email license rating createdAt fcmTokens",
      })
      .populate({
        path: "vehicle",
        select: "image name registrationNo noOfSeats odo createdAt category",
        populate: { path: "category" },
      })
      .populate({ path: "corporate" })
      .populate({ path: "vehicleCategory", select: "name image" })
      .populate({
        path: "customerRideDetails",
        populate: {
          path: "customer",
          select: "fullName phone countryCode email avatar",
        },
      });

    if (ride) {
      let receivers: any = {};
      let titleAndBody: any = {};
      let senderName;

      const corporateEntity = await CorporateModel.findById(corporate)
        .select('fullName')
        .maxTimeMS(3000);

      if (corporateEntity) {
        receivers.fleetOwner = ride.fleetOwner;
        senderName = corporateEntity.fullName;
        titleAndBody.title = `Group Corporate Ride`;
        titleAndBody.body = `${corporateEntity.fullName} has requested for a ride`;

        let fcmTokens: any = [];
        const fleetOwnerModel = await FleetOwnerModel.findById(fleetOwner)
          .select('fcmTokens')
          .maxTimeMS(3000);
        if (fleetOwnerModel) fcmTokens = fleetOwnerModel.fcmTokens;

        let notificationDetails = {
          notification: titleAndBody,
          fcmTokens: fcmTokens,
          data: {
            featureId: ride._id,
            type: NotificationType.RIDE,
          },
          featureId: ride._id,
          notificationtype: NotificationType.RIDE,
          notificationData: {},
          ...titleAndBody,
          remarks: "",
          ...receivers,
          thumbnail: "",
          avatar: "",
          senderName: senderName,
        };

        sendPushNotificationToPreviousFCM(notificationDetails);
        sendPushNotificationToNewFCM(notificationDetails);
      }
    }

    return res.status(200).json({
      success: true,
      result: ride,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

export const findDistanceAndDuration = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { srcLatitude, desLatitude, srcLongitude, desLongitude } = req.body;

    var config = {
      method: "get",
      url: `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${srcLatitude}%2C${srcLongitude}&destinations=${desLatitude}%2C${desLongitude}&key=${process.env.GEOCODER_API_KEY}`,
      headers: {},
    };

    axios(config)
      .then(function (response: any) {
        res.status(200).json({
          success: true,
          result: response.data.status == "OK" ? response.data : null,
        });
      })
      .catch(function (error: any) {
        console.log(error);
        res.status(400).json({ success: false, result: error });
      });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const fetchVehicleType = async (req: Request, res: Response) => {
  try {
    let vehicleTypes = await VehicleCategoryModel.find({});
    if (vehicleTypes != null) {
      return res.status(200).json({
        success: true,
        message: "Vehicle types fetched successfully",
        result: vehicleTypes,
      });
    } else {
      return res.status(200).json({
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error,
    });
  }
};

export const fetchAllFleetOwner = async (req: Request, res: Response) => {
  try {
    console.log(req.body);
    let fleetOwner = await CorporateModel.findById({
      _id: req.body.user,
    }).populate("fleetOwners");
    if (fleetOwner != null) {
      return res.status(200).json({
        success: true,
        message: "Fleet owners fetched successfully",
        result: fleetOwner,
      });
    } else {
      return res.status(200).json({
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error,
    });
  }
};

export const fetchIndividualRideList = async (req: Request, res: Response) => {
  try {
    let { id, status, rideType } = req.body;
    var ride;
    let todayStartDate = new Date();
    let todayEndDate = new Date(new Date().setHours(23, 59, 59, 999));

    if (status) {
      ride = await RideModel.find({
        $and: [
          { corporate: id },
          { rideStatus: status },
          { corporateRideType: rideType },
        ],
      })
        .populate("customerRideDetails")
        .populate("fleetOwner")
        .populate("customer");
    } else {
      ride = await RideModel.find({
        bookingDateTime: {
          $gte: todayStartDate,
        },
        $and: [
          { corporate: id },
          {
            rideStatus: {
              $in: [
                RideStatus.PENDING,
                RideStatus.FLEETOWNERAPPROVALPENDING,
                RideStatus.ARRIVED,
                RideStatus.ONTHEWAY,
                RideStatus.RIDESTARTED,
                RideStatus.ASSIGNED,
              ],
            },
          },
          { corporateRideType: rideType },
        ],
      })
        .populate("customerRideDetails")
        .populate("fleetOwner")
        .populate("customer");
    }

    if (ride != null) {
      return res.status(200).json({
        success: true,
        message: "Rides fetched successfully",
        result: ride,
      });
    } else {
      return res.status(200).json({
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error,
    });
  }
};

export const fetchGroupRideList = async (req: Request, res: Response) => {
  try {
    let { id, status, rideType } = req.body;
    var ride;
    let todayStartDate = new Date();
    let todayEndDate = new Date(new Date().setHours(23, 59, 59, 999));

    if (status) {
      ride = await RideModel.find({
        $and: [
          { corporate: id },
          { rideStatus: status },
          { corporateRideType: { $in: [CorporateRideType.HOMEtoOFFICE, CorporateRideType.OFFICEtoHOME] } },
        ],
      })
        .populate("customerRideDetails")
        .populate("fleetOwner")
        .populate("customer");
    } else {
      ride = await RideModel.find({
        bookingDateTime: {
          $gte: todayStartDate,
        },
        $and: [
          { corporate: id },
          {
            rideStatus: {
              $in: [
                RideStatus.PENDING,
                RideStatus.FLEETOWNERAPPROVALPENDING,
                RideStatus.ARRIVED,
                RideStatus.ONTHEWAY,
                RideStatus.RIDESTARTED,
                RideStatus.ASSIGNED,
              ],
            },
          },
          { corporateRideType: { $in: [CorporateRideType.HOMEtoOFFICE, CorporateRideType.OFFICEtoHOME] } },
        ],
      })
        .populate("customerRideDetails")
        .populate("fleetOwner")
        .populate("customer");
    }

    if (ride != null) {
      return res.status(200).json({
        success: true,
        message: "Rides fetched successfully",
        result: ride,
      });
    } else {
      return res.status(200).json({
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error,
    });
  }
};

export const fetchCorporateCredit = async (req: Request, res: Response) => {
  try {
    let { fleetOwnerId } = req.body;
    let credit = await CorporateCreditModel.find({
      corporate: req.body.user, fleetOwner: fleetOwnerId
    });
    if (credit != null) {
      return res.status(200).json({
        success: true,
        message: "Credit fetched successfully",
        result: credit,
      });
    } else {
      return res.status(200).json({
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error,
    });
  }
};





// import { Request, Response, NextFunction, query } from "express";
// import { VehicleCategoryModel } from "../../appModule/vehicle/models/vehicleCategory.model";
// import {
//   VehicleChargeModel,
//   RideType as ChargeType,
// } from "../../adminModule/fleetOwner/models/vehicleCharge.model";
// import { FleetOwnerModel } from "../../adminModule/fleetOwner/models/fleetOwner.model";
// import { CustomerModel } from "../../appModule/customer/customer.model";
// import { CustomerRideDetailModel } from "../../appModule/ride/models/customerRideDetail.model";
// import {
//   CorporateRideType,
//   Ride,
//   RideModel,
//   RideStatus,
//   RideTransactionStatus,
//   RideType,
// } from "../../appModule/ride/models/ride.model";
// import { geocoder } from "../../utils/geocoder";
// import { createTransaction } from "../../appModule/transaction/transaction.controller";
// import {
//   TransactionMedium,
//   TransactionStatus,
// } from "../../appModule/transaction/transaction.model";
// import { CorporateModel } from "../../adminModule/corporate/models/corporate.model";
// import { NotificationType } from "../../notificationModule/notification";
// import {
//   sendPushNotificationToPreviousFCM,
//   sendPushNotificationToNewFCM,
// } from "../../notificationModule/notification.controller";
// import { UserRole } from "../../utils/common/commonClasses";
// import { generateRandomNumber } from "../../utils/common/commonFunction";
// import { CorporateCreditModel } from "../../adminModule/corporate/models/corporateCredit.model";
// const axios = require("axios").default;

// export const createRide = async (
//   req: any,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     let {
//       autoPaid,
//       user,
//       userRole,
//       corporate,
//       customer,
//       fleetOwner,
//       bookingDateTime,
//       pickupLocation,
//       dropOffLocation,
//       note = "",
//       type = "One Way",
//       estimatedAmount = 0,
//       paidAmount = 0,
//       estimatedTripDuration,
//       estimatedKm,
//       vehicleCategory,
//       corporateRideType,
//     } = req.body;
//     let vehicleCharge = await VehicleChargeModel.findOne({
//       fleetOwner: fleetOwner,
//       rideType: ChargeType.ONEWAY,
//       vehicleCategory,
//     });
//     if (vehicleCharge == null) {
//       return res.status(200).json({
//         success: false,
//         message: "No charges set for this category vehicle by fleetowner",
//       });
//     }
//     let transaction: any;
//     let autoPaidByCorporate = Boolean(autoPaid);
//     pickupLocation = JSON.parse(pickupLocation);
//     dropOffLocation = JSON.parse(dropOffLocation);
//     bookingDateTime = new Date(bookingDateTime);
//     if (type == RideType.OUTSTATION && paidAmount > 0) {
//       transaction = await createTransaction(
//         customer,
//         fleetOwner,
//         paidAmount,
//         TransactionMedium.RAZORPAY,
//         TransactionStatus.PENDING
//       );
//     }
//     let customerLocationIds: any = [];
//     if (pickupLocation != null) {
//       const loc = await geocoder.reverse({
//         lat: pickupLocation["lat"],
//         lon: pickupLocation["lng"],
//       });
//       console.log(loc);
//       var city = loc[0]["city"];
//       var state = loc[0]["administrativeLevels"]["level1long"];
//       var pincode = loc[0]["zipcode"];
//       var fullAddress = loc[0]["formattedAddress"];

//       pickupLocation = {
//         fullAddress: fullAddress,
//         landmark: "",
//         pincode,
//         city,
//         state,
//         location: {
//           type: "Point",
//           coordinates: [pickupLocation["lng"], pickupLocation["lat"]],
//         },
//       };
//     }
//     if (dropOffLocation != null) {
//       const loc = await geocoder.reverse({
//         lat: dropOffLocation["lat"],
//         lon: dropOffLocation["lng"],
//       });
//       console.log(loc);
//       var city = loc[0]["city"];
//       var state = loc[0]["administrativeLevels"]["level1long"];
//       var pincode = loc[0]["zipcode"];
//       var fullAddress = loc[0]["formattedAddress"];

//       dropOffLocation = [
//         {
//           fullAddress: fullAddress,
//           landmark: "",
//           pincode,
//           city,
//           state,
//           location: {
//             type: "Point",
//             coordinates: [dropOffLocation["lng"], dropOffLocation["lat"]],
//           },
//         },
//       ];
//     }

//     let customerIds: any = [];

//     for (let i = 0; i < dropOffLocation.length; i++) {
//       const address = dropOffLocation[i];

//       let locationDetailQuery: any = {
//         customer,
//         corporate,
//         pickupLocation: i == 0 ? pickupLocation : dropOffLocation[i - 1],
//         dropOffLocation: address,
//         bookingDateTime,
//         fleetOwner,
//       };

//       customerIds.push(customer);

//       let rideLocationDetails = await CustomerRideDetailModel.create(
//         locationDetailQuery
//       );
//       customerLocationIds.push(rideLocationDetails._id);
//     }

//     if (vehicleCharge != null) {
//       let fleetOwnerData = await FleetOwnerModel.findById(fleetOwner);

//       if (fleetOwnerData != null) {
//         let date = new Date(bookingDateTime);
//         let index = -1;
//         var time = parseFloat(`${date!.getHours()}.${date!.getMinutes()}`);
//         for (var i = 0; i < fleetOwnerData.peakHourTime.length; i++) {
//           if (
//             time >= fleetOwnerData.peakHourTime[i].startTime &&
//             time < fleetOwnerData.peakHourTime[i].endTime
//           ) {
//             index = i;
//           }
//         }
//         estimatedAmount =
//           estimatedKm *
//           (index == -1
//             ? vehicleCharge.normalRate
//             : vehicleCharge.peakHourTimeRate);
//       }
//     }

//     let fleetOwnerCredit = await CorporateCreditModel.findOne({ fleetOwner: fleetOwner });
//     if (fleetOwnerCredit == null) {
//       return res.status(200).json({
//         success: false,
//         message: "No Credit set by fleetowner",
//       });
//     } else {
//       if (fleetOwnerCredit.balanceCredit < estimatedAmount) {
//         return res.status(200).json({
//           success: false,
//           message: "Insufficient Credit balance",
//         });
//       }
//     }

//     let rideQuery: any = {
//       customer: customerIds,
//       autoPaidByCorporate,
//       fleetOwner,
//       bookingDateTime,
//       note,
//       corporate,
//       isSharedRide:
//         corporateRideType != null && corporateRideType != undefined
//           ? true
//           : false,
//       corporateRideType:
//         corporateRideType != null && corporateRideType != undefined
//           ? corporateRideType
//           : CorporateRideType.INDIVIDUAL,
//       isCorporate: true,
//       customerRideDetails: customerLocationIds,
//       type,
//       estimatedTripDuration,
//       totalTripDuration: estimatedTripDuration,
//       estimatedAmount,
//       totalAmount: estimatedAmount,
//       paidAmount,
//       estimatedKm,
//       totalKm: estimatedKm,
//       otp: generateRandomNumber(1000, 9999),
//       createdBy: "Corporate",
//       transaction:
//         type != RideType.OUTSTATION || paidAmount == 0
//           ? []
//           : [transaction!._id],
//       transactionStatus: RideTransactionStatus.PENDING,
//       vehicleCategory,
//       rideStatus:
//         userRole == UserRole.CORPORATE || userRole == "CORPORATE"
//           ? RideStatus.FLEETOWNERAPPROVALPENDING
//           : RideStatus.CORPORATEAPPROVALPENDING,
//     };

//     if (userRole == UserRole.FLEETOWNER) {
//       rideQuery["milestones"] = { "Ride accepted": new Date() };
//     }

//     let ride: any = await RideModel.create(rideQuery);

//     if (transaction != null) {
//       transaction.ride = ride._id;
//     }

//     await CustomerRideDetailModel.updateMany(
//       { _id: { $in: customerLocationIds } },
//       { $set: { ride: ride._id } }
//     );

//     ride = await RideModel.findById(ride._id)
//       .populate({
//         path: "customer",
//         select: "fullName avatar phone email fcmTokens",
//       })
//       .populate({
//         path: "driver",
//         select:
//           "fullName avatar phone email license rating createdAt fcmTokens",
//       })
//       .populate({
//         path: "vehicle",
//         select: "image name registrationNo noOfSeats odo createdAt category",
//         populate: { path: "category" },
//       })
//       .populate({ path: "corporate" })
//       .populate({ path: "vehicleCategory", select: "name image" })
//       .populate({
//         path: "customerRideDetails",
//         populate: {
//           path: "customer",
//           select: "fullName phone countryCode email avatar",
//         },
//       });

//     if (ride) {
//       let receivers: any = {};
//       let titleAndBody: any = {};
//       let senderName;


//       const corporateEntity = await CorporateModel.findById(corporate);

//       if (corporateEntity) {
//         receivers.fleetOwner = ride.fleetOwner;

//         senderName = corporateEntity.fullName;

//         titleAndBody.title = `Individual Corporate Ride`;
//         titleAndBody.body = `${corporateEntity.fullName} has requested for a ride`;

//         let fcmTokens: any = [];
//         const fleetOwnerModel = await FleetOwnerModel.findById(fleetOwner);
//         if (fleetOwnerModel) fcmTokens = fleetOwnerModel.fcmTokens;

//         let notificationDetails = {
//           notification: titleAndBody,
//           fcmTokens: fcmTokens,
//           data: {
//             featureId: ride._id,
//             type: NotificationType.RIDE,
//           },
//           featureId: ride._id,
//           notificationtype: NotificationType.RIDE,
//           notificationData: {},
//           ...titleAndBody,
//           remarks: "",
//           ...receivers,
//           thumbnail: "",
//           avatar: "",
//           senderName: senderName,
//         };

//         sendPushNotificationToPreviousFCM(notificationDetails);
//         sendPushNotificationToNewFCM(notificationDetails);
//         // createNotification(notificationDetails);
//       }

//       // if (userRole == UserRole.CUSTOMER) {
//       //   receivers.fleetOwner = ride.fleetOwner;

//       //   senderName = ride.customer.fullName;

//       //   titleAndBody.title = `New ${ride.type} Ride`;
//       //   titleAndBody.body = `${senderName} has requested for a ride`;

//       //   let fcmTokens: any = [];
//       //   const fleetOwnerModel = await FleetOwnerModel.findById(fleetOwner);
//       //   if (fleetOwnerModel) fcmTokens = fleetOwnerModel.fcmTokens;

//       //   let notificationDetails = {
//       //     notification: titleAndBody,
//       //     fcmTokens: fcmTokens,
//       //     data: {
//       //       featureId: ride._id,
//       //       type: NotificationType.RIDE,
//       //     },
//       //     featureId: ride._id,
//       //     notificationtype: NotificationType.RIDE,
//       //     notificationData: {},
//       //     ...titleAndBody,
//       //     remarks: "",
//       //     ...receivers,
//       //     thumbnail: "",
//       //     avatar: "",
//       //     senderName: senderName,
//       //   };

//       //   sendPushNotificationToPreviousFCM(notificationDetails);
//       //   sendPushNotificationToNewFCM(notificationDetails);
//       //   // createNotification(notificationDetails);
//       // } else if (userRole == UserRole.FLEETOWNER) {
//       //   // To Customer
//       //   receivers = { customer: ride.customer._id };

//       //   titleAndBody.title = `New Ride`;
//       //   titleAndBody.body = `A new ${ride.type.toLowerCase()} ride is booked for you`;

//       //   let fcmTokens = ride.customer.fcmTokens;

//       //   let notificationDetails = {
//       //     notification: titleAndBody,
//       //     fcmTokens: fcmTokens,
//       //     data: {
//       //       featureId: ride._id,
//       //       type: NotificationType.RIDE,
//       //     },
//       //     featureId: ride._id,
//       //     notificationtype: NotificationType.RIDE,
//       //     notificationData: {},
//       //     ...titleAndBody,
//       //     remarks: "",
//       //     ...receivers,
//       //     thumbnail: "",
//       //     avatar: "",
//       //     senderName: senderName,
//       //   };

//       //   sendPushNotificationToPreviousFCM(notificationDetails);
//       //   sendPushNotificationToNewFCM(notificationDetails);
//       //   // createNotification(notificationDetails);

//       //   // To DRIVER
//       //   receivers = { driver: ride.driver._id };

//       //   titleAndBody.title = `New Ride`;
//       //   titleAndBody.body = `A new ${ride.type.toLowerCase()} ride has been assigned to you`;

//       //   fcmTokens = ride.driver.fcmTokens;

//       //   notificationDetails = {
//       //     notification: titleAndBody,
//       //     fcmTokens: fcmTokens,
//       //     data: {
//       //       featureId: ride._id,
//       //       type: NotificationType.RIDE,
//       //     },
//       //     featureId: ride._id,
//       //     notificationtype: NotificationType.RIDE,
//       //     notificationData: {},
//       //     ...titleAndBody,
//       //     remarks: "",
//       //     ...receivers,
//       //     thumbnail: "",
//       //     avatar: "",
//       //     senderName: senderName,
//       //   };

//       //   sendPushNotificationToPreviousFCM(notificationDetails);
//       //   sendPushNotificationToNewFCM(notificationDetails);
//       //   // createNotification(notificationDetails);
//       // }
//     }

//     return res.status(200).json({
//       success: true,
//       result: ride,
//     });
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       error: error.message,
//     });
//   }
// };

// export const createGroupRide = async (
//   req: any,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     let {
//       autoPaid,
//       user,
//       userRole,
//       corporate,
//       fleetOwner,
//       bookingDateTime,
//       note = "",
//       type = "One Way",
//       estimatedAmount = 0,
//       paidAmount = 0,
//       estimatedTripDuration,
//       estimatedKm,
//       vehicleCategory,
//       corporateRideType,
//       grpDetail,
//       customerIds,
//     } = req.body;

//     let vehicleCharge = await VehicleChargeModel.findOne({
//       fleetOwner: fleetOwner,
//       rideType: ChargeType.ONEWAY,
//       vehicleCategory,
//     });
//     if (vehicleCharge == null) {
//       return res.status(200).json({
//         success: false,
//         message: "No charges set for this category vehicle by fleetowner",
//       });
//     }

//     let transaction: any;
//     let autoPaidByCorporate = Boolean(autoPaid);
//     grpDetail = JSON.parse(grpDetail);
//     customerIds = JSON.parse(customerIds);
//     // pickupLocation = JSON.parse(pickupLocation);
//     // dropOffLocation = JSON.parse(dropOffLocation);
//     // bookingDateTime = new Date(bookingDateTime);
//     if (type == RideType.OUTSTATION && paidAmount > 0) {
//       // transaction = await createTransaction(
//       //   customer,
//       //   fleetOwner,
//       //   paidAmount,
//       //   TransactionMedium.RAZORPAY,
//       //   TransactionStatus.PENDING
//       // );
//     }
//     let customerLocationIds: any = [];
//     for (let index = 0; index < grpDetail.length; index++) {
//       const element = grpDetail[index];
//       if (element["pickupLocation"] != null) {
//         const loc = await geocoder.reverse({
//           lat: element["pickupLocation"]["lat"],
//           lon: element["pickupLocation"]["lng"],
//         });
//         console.log(loc);
//         var city = loc[0]["city"];
//         var state = loc[0]["administrativeLevels"]["level1long"];
//         var pincode = loc[0]["zipcode"];
//         var fullAddress = loc[0]["formattedAddress"];
//         element["pickupLocation"] = {
//           fullAddress: fullAddress,
//           landmark: "",
//           pincode,
//           city,
//           state,
//           location: {
//             type: "Point",
//             coordinates: [
//               element["pickupLocation"]["lng"],
//               element["pickupLocation"]["lat"],
//             ],
//           },
//         };
//       }
//       if (element["dropOffLocation"] != null) {
//         const loc = await geocoder.reverse({
//           lat: element["dropOffLocation"]["lat"],
//           lon: element["dropOffLocation"]["lng"],
//         });
//         console.log(loc);
//         var city = loc[0]["city"];
//         var state = loc[0]["administrativeLevels"]["level1long"];
//         var pincode = loc[0]["zipcode"];
//         var fullAddress = loc[0]["formattedAddress"];
//         element["dropOffLocation"] = [
//           {
//             fullAddress: fullAddress,
//             landmark: "",
//             pincode,
//             city,
//             state,
//             location: {
//               type: "Point",
//               coordinates: [
//                 element["dropOffLocation"]["lng"],
//                 element["dropOffLocation"]["lat"],
//               ],
//             },
//           },
//         ];
//       }
//       // let customerIds: any = [];
//       for (let i = 0; i < element["dropOffLocation"].length; i++) {
//         const address = element["dropOffLocation"][i];
//         let locationDetailQuery: any = {
//           customer: element["customerId"],
//           corporate,
//           pickupLocation:
//             i == 0
//               ? element["pickupLocation"]
//               : element["dropOffLocation"][i - 1],
//           dropOffLocation: address,
//           bookingDateTime: element["bookingDateTime"],
//           fleetOwner,
//           autoPaidByCorporate,
//         };
//         // customerIds.push(customer);
//         let rideLocationDetails = await CustomerRideDetailModel.create(
//           locationDetailQuery
//         );
//         customerLocationIds.push(rideLocationDetails._id);
//       }
//     }

//     if (vehicleCharge != null) {
//       let fleetOwnerData = await FleetOwnerModel.findById(fleetOwner);
//       if (fleetOwnerData != null) {
//         let date = new Date(bookingDateTime);
//         let index = -1;
//         var time = parseFloat(`${date!.getHours()}.${date!.getMinutes()}`);
//         for (var i = 0; i < fleetOwnerData.peakHourTime.length; i++) {
//           if (
//             time >= fleetOwnerData.peakHourTime[i].startTime &&
//             time < fleetOwnerData.peakHourTime[i].endTime
//           ) {
//             index = i;
//           }
//         }
//         estimatedAmount =
//           estimatedKm *
//           (index == -1
//             ? vehicleCharge.normalRate
//             : vehicleCharge.peakHourTimeRate);
//       }
//     }


//     let fleetOwnerCredit = await CorporateCreditModel.findOne({ fleetOwner: fleetOwner });
//     if (fleetOwnerCredit == null) {
//       return res.status(200).json({
//         success: false,
//         message: "No Credit set by fleetowner",
//       });
//     } else {
//       if (fleetOwnerCredit.balanceCredit < estimatedAmount) {
//         return res.status(200).json({
//           success: false,
//           message: "Insufficient Credit balance",
//         });
//       }
//     }

//     let rideQuery: any = {
//       customer: customerIds,
//       fleetOwner,
//       bookingDateTime,
//       note,
//       corporate,
//       autoPaidByCorporate,
//       isSharedRide:
//         corporateRideType != null && corporateRideType != undefined
//           ? true
//           : false,
//       corporateRideType:
//         corporateRideType != null && corporateRideType != undefined
//           ? corporateRideType
//           : CorporateRideType.INDIVIDUAL,
//       isCorporate: true,
//       customerRideDetails: customerLocationIds,
//       type,
//       estimatedTripDuration,
//       totalTripDuration: estimatedTripDuration,
//       estimatedAmount,
//       totalAmount: estimatedAmount,
//       paidAmount,
//       estimatedKm,
//       totalKm: estimatedKm,
//       otp: generateRandomNumber(1000, 9999),
//       createdBy: "Corporate",
//       transaction:
//         type != RideType.OUTSTATION || paidAmount == 0
//           ? []
//           : [transaction!._id],
//       transactionStatus: RideTransactionStatus.PENDING,
//       vehicleCategory,
//       rideStatus:
//         userRole == UserRole.CORPORATE || userRole == "CORPORATE"
//           ? RideStatus.FLEETOWNERAPPROVALPENDING
//           : RideStatus.CORPORATEAPPROVALPENDING,
//     };
//     if (userRole == UserRole.FLEETOWNER) {
//       rideQuery["milestones"] = { "Ride accepted": new Date() };
//     }
//     let ride: any = await RideModel.create(rideQuery);
//     if (transaction != null) {
//       transaction.ride = ride._id;
//     }
//     await CustomerRideDetailModel.updateMany(
//       { _id: { $in: customerLocationIds } },
//       { $set: { ride: ride._id } }
//     );
//     ride = await RideModel.findById(ride._id)
//       .populate({
//         path: "customer",
//         select: "fullName avatar phone email fcmTokens",
//       })
//       .populate({
//         path: "driver",
//         select:
//           "fullName avatar phone email license rating createdAt fcmTokens",
//       })
//       .populate({
//         path: "vehicle",
//         select: "image name registrationNo noOfSeats odo createdAt category",
//         populate: { path: "category" },
//       })
//       .populate({ path: "corporate" })
//       .populate({ path: "vehicleCategory", select: "name image" })
//       .populate({
//         path: "customerRideDetails",
//         populate: {
//           path: "customer",
//           select: "fullName phone countryCode email avatar",
//         },
//       });


//     if (ride.customerRideDetails.length > 0) {

//       let sortedLocationId: any = [];

//       var config = {
//         method: 'get',
//         headers: {}
//         , 'url': '',
//       };

//       let initialCoordinates = [0, 1];
//       let destinations = '';
//       let locationData: any = [];

//       if (corporateRideType == CorporateRideType.HOMEtoOFFICE) {

//         initialCoordinates = ride.customerRideDetails[0].dropOffLocation['location']['coordinates'];

//         for (let i = 0; i < ride.customerRideDetails.length; i++) {

//           locationData.push({ id: ride.customerRideDetails[i]['_id'], km: 0 });

//           const coordinates = ride.customerRideDetails[i].pickupLocation['location']['coordinates'];
//           destinations += `${coordinates[1]}%2C${coordinates[0]}%7C`;

//           if (i != ride.customerRideDetails.length - 1) {
//             destinations += '%7C';
//           }
//         }
//       } else if (corporateRideType == CorporateRideType.OFFICEtoHOME) {

//         initialCoordinates = ride.customerRideDetails[0].pickupLocation['location']['coordinates'];

//         for (let i = 0; i < ride.customerRideDetails.length; i++) {

//           locationData.push({ id: ride.customerRideDetails[i]['_id'], km: 0 });

//           const coordinates = ride.customerRideDetails[i].dropOffLocation['location']['coordinates'];
//           destinations += `${coordinates[1]}%2C${coordinates[0]}`;
//           if (i != ride.customerRideDetails.length - 1) {
//             destinations += '%7C';
//           }
//         }
//       }

//       config['url']
//         = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${initialCoordinates[1]}%2C${initialCoordinates[0]}&destinations=${destinations}&key=${process.env.GEOCODER_API_KEY}`;

//       axios(config)
//         .then(async function (response: any) {
//           let data = response.data.status == 'OK' ? response.data : null;
//           if (data != null) {
//             data = data['rows'][0]['elements'];

//             data.forEach((result: any, i: number) => {
//               if (result['distance']['text'].includes('km')) {
//                 locationData[i]['km'] = result['distance']['text'].split(' ')[0];
//               } else {
//                 locationData[i]['km'] = (result['distance']['text'].split(' ')[0]) / 1000;
//               }
//             });

//             let sortedData = locationData.sort(function (a: any, b: any) { return a['km'] - b['km'] });

//             sortedData.forEach((loc: any) => {
//               sortedLocationId.push(loc['id']);
//             });

//             await RideModel.findByIdAndUpdate(ride._id, { $set: { customerRideDetails: sortedLocationId } }, { new: true, runValidators: true });
//           }
//         })
//         .catch(function (error: any) {
//           console.log(error);
//         });
//     }

//     if (ride) {

//       let receivers: any = {};
//       let titleAndBody: any = {};
//       let senderName;


//       const corporateEntity = await CorporateModel.findById(corporate);

//       if (corporateEntity) {
//         receivers.fleetOwner = ride.fleetOwner;

//         senderName = corporateEntity.fullName;

//         titleAndBody.title = `Group Corporate Ride`;
//         titleAndBody.body = `${corporateEntity.fullName} has requested for a ride`;

//         let fcmTokens: any = [];
//         const fleetOwnerModel = await FleetOwnerModel.findById(fleetOwner);
//         if (fleetOwnerModel) fcmTokens = fleetOwnerModel.fcmTokens;

//         let notificationDetails = {
//           notification: titleAndBody,
//           fcmTokens: fcmTokens,
//           data: {
//             featureId: ride._id,
//             type: NotificationType.RIDE,
//           },
//           featureId: ride._id,
//           notificationtype: NotificationType.RIDE,
//           notificationData: {},
//           ...titleAndBody,
//           remarks: "",
//           ...receivers,
//           thumbnail: "",
//           avatar: "",
//           senderName: senderName,
//         };

//         sendPushNotificationToPreviousFCM(notificationDetails);
//         sendPushNotificationToNewFCM(notificationDetails);
//         // createNotification(notificationDetails);
//       }


//       // if (userRole == UserRole.CUSTOMER) {
//       //   receivers.fleetOwner = ride.fleetOwner;
//       //   senderName = ride.customer.fullName;
//       //   titleAndBody.title = `New ${ride.type} Ride`;
//       //   titleAndBody.body = `${senderName} has requested for a ride`;
//       //   let fcmTokens: any = [];
//       //   const fleetOwnerModel = await FleetOwnerModel.findById(fleetOwner);
//       //   if (fleetOwnerModel) fcmTokens = fleetOwnerModel.fcmTokens;
//       //   let notificationDetails = {
//       //     notification: titleAndBody,
//       //     fcmTokens: fcmTokens,
//       //     data: {
//       //       featureId: ride._id,
//       //       type: NotificationType.RIDE,
//       //     },
//       //     featureId: ride._id,
//       //     notificationtype: NotificationType.RIDE,
//       //     notificationData: {},
//       //     ...titleAndBody,
//       //     remarks: "",
//       //     ...receivers,
//       //     thumbnail: "",
//       //     avatar: "",
//       //     senderName: senderName,
//       //   };
//       //   sendPushNotificationToPreviousFCM(notificationDetails);
//       //   sendPushNotificationToNewFCM(notificationDetails);
//       //   // createNotification(notificationDetails);
//       // } else if (userRole == UserRole.FLEETOWNER) {
//       //   // To Customer
//       //   receivers = { customer: ride.customer._id };
//       //   titleAndBody.title = `New Ride`;
//       //   titleAndBody.body = `A new ${ride.type.toLowerCase()} ride is booked for you`;
//       //   let fcmTokens = ride.customer.fcmTokens;
//       //   let notificationDetails = {
//       //     notification: titleAndBody,
//       //     fcmTokens: fcmTokens,
//       //     data: {
//       //       featureId: ride._id,
//       //       type: NotificationType.RIDE,
//       //     },
//       //     featureId: ride._id,
//       //     notificationtype: NotificationType.RIDE,
//       //     notificationData: {},
//       //     ...titleAndBody,
//       //     remarks: "",
//       //     ...receivers,
//       //     thumbnail: "",
//       //     avatar: "",
//       //     senderName: senderName,
//       //   };
//       //   sendPushNotificationToPreviousFCM(notificationDetails);
//       //   sendPushNotificationToNewFCM(notificationDetails);
//       //   // createNotification(notificationDetails);
//       //   // To DRIVER
//       //   receivers = { driver: ride.driver._id };
//       //   titleAndBody.title = `New Ride`;
//       //   titleAndBody.body = `A new ${ride.type.toLowerCase()} ride has been assigned to you`;
//       //   fcmTokens = ride.driver.fcmTokens;
//       //   notificationDetails = {
//       //     notification: titleAndBody,
//       //     fcmTokens: fcmTokens,
//       //     data: {
//       //       featureId: ride._id,
//       //       type: NotificationType.RIDE,
//       //     },
//       //     featureId: ride._id,
//       //     notificationtype: NotificationType.RIDE,
//       //     notificationData: {},
//       //     ...titleAndBody,
//       //     remarks: "",
//       //     ...receivers,
//       //     thumbnail: "",
//       //     avatar: "",
//       //     senderName: senderName,
//       //   };
//       //   sendPushNotificationToPreviousFCM(notificationDetails);
//       //   sendPushNotificationToNewFCM(notificationDetails);
//       //   // createNotification(notificationDetails);
//       // }
//     }
//     return res.status(200).json({
//       success: true,
//       result: ride,
//     });
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       error: error.message,
//     });
//   }
// };

// export const findDistanceAndDuration = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const { srcLatitude, desLatitude, srcLongitude, desLongitude } = req.body;

//     var config = {
//       method: "get",
//       url: `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${srcLatitude}%2C${srcLongitude}&destinations=${desLatitude}%2C${desLongitude}&key=${process.env.GEOCODER_API_KEY}`,
//       headers: {},
//     };

//     axios(config)
//       .then(function (response: any) {
//         res.status(200).json({
//           success: true,
//           result: response.data.status == "OK" ? response.data : null,
//         });
//       })
//       .catch(function (error: any) {
//         console.log(error);
//         res.status(400).json({ success: false, result: error });
//       });

//     // return res.status(200).json({ success: true });
//   } catch (error) {
//     res.status(400).json({ success: false, error: error.message });
//   }
// };

// export const fetchVehicleType = async (req: Request, res: Response) => {
//   try {
//     let vehicleTypes = await VehicleCategoryModel.find({});
//     if (vehicleTypes != null) {
//       return res.status(200).json({
//         success: true,
//         message: "Vehicle types fetched successfully",
//         result: vehicleTypes,
//       });
//     } else {
//       return res.status(200).json({
//         success: false,
//       });
//     }
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       error: error,
//     });
//   }
// };

// export const fetchAllFleetOwner = async (req: Request, res: Response) => {
//   try {
//     console.log(req.body);
//     let fleetOwner = await CorporateModel.findById({
//       _id: req.body.user,
//     }).populate("fleetOwners");
//     if (fleetOwner != null) {
//       return res.status(200).json({
//         success: true,
//         message: "Fleet owners fetched successfully",
//         result: fleetOwner,
//       });
//     } else {
//       return res.status(200).json({
//         success: false,
//       });
//     }
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       error: error,
//     });
//   }
// };

// export const fetchIndividualRideList = async (req: Request, res: Response) => {
//   try {
//     let { id, status, rideType } = req.body;
//     var ride;
//     let todayStartDate = new Date();
//     let todayEndDate = new Date(new Date().setHours(23, 59, 59, 999));

//     if (status) {
//       ride = await RideModel.find({
//         $and: [
//           { corporate: id },
//           { rideStatus: status },
//           { corporateRideType: rideType },
//         ],
//       })
//         .populate("customerRideDetails")
//         .populate("fleetOwner")
//         .populate("customer");
//     } else {
//       ride = await RideModel.find({
//         bookingDateTime: {
//           $gte: todayStartDate,
//         },
//         $and: [
//           { corporate: id },
//           {
//             rideStatus: {
//               $in: [
//                 RideStatus.PENDING,
//                 RideStatus.FLEETOWNERAPPROVALPENDING,
//                 RideStatus.ARRIVED,
//                 RideStatus.ONTHEWAY,
//                 RideStatus.RIDESTARTED,
//                 RideStatus.ASSIGNED,
//               ],
//             },
//           },
//           { corporateRideType: rideType },
//         ],
//       })
//         .populate("customerRideDetails")
//         .populate("fleetOwner")
//         .populate("customer");
//     }

//     if (ride != null) {
//       return res.status(200).json({
//         success: true,
//         message: "Rides fetched successfully",
//         result: ride,
//       });
//     } else {
//       return res.status(200).json({
//         success: false,
//       });
//     }
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       error: error,
//     });
//   }
// };

// export const fetchGroupRideList = async (req: Request, res: Response) => {
//   try {
//     let { id, status, rideType } = req.body;
//     var ride;
//     let todayStartDate = new Date();
//     let todayEndDate = new Date(new Date().setHours(23, 59, 59, 999));

//     if (status) {
//       ride = await RideModel.find({
//         $and: [
//           { corporate: id },
//           { rideStatus: status },
//           { corporateRideType: { $in: [CorporateRideType.HOMEtoOFFICE, CorporateRideType.OFFICEtoHOME] } },
//         ],
//       })
//         .populate("customerRideDetails")
//         .populate("fleetOwner")
//         .populate("customer");
//     } else {
//       ride = await RideModel.find({
//         bookingDateTime: {
//           $gte: todayStartDate,
//         },
//         $and: [
//           { corporate: id },
//           {
//             rideStatus: {
//               $in: [
//                 RideStatus.PENDING,
//                 RideStatus.FLEETOWNERAPPROVALPENDING,
//                 RideStatus.ARRIVED,
//                 RideStatus.ONTHEWAY,
//                 RideStatus.RIDESTARTED,
//                 RideStatus.ASSIGNED,
//               ],
//             },
//           },
//           { corporateRideType: { $in: [CorporateRideType.HOMEtoOFFICE, CorporateRideType.OFFICEtoHOME] } },
//         ],
//       })
//         .populate("customerRideDetails")
//         .populate("fleetOwner")
//         .populate("customer");
//     }

//     if (ride != null) {
//       return res.status(200).json({
//         success: true,
//         message: "Rides fetched successfully",
//         result: ride,
//       });
//     } else {
//       return res.status(200).json({
//         success: false,
//       });
//     }
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       error: error,
//     });
//   }
// };

// export const fetchCorporateCredit = async (req: Request, res: Response) => {
//   try {
//     let { fleetOwnerId } = req.body;
//     let credit = await CorporateCreditModel.find({
//       corporate: req.body.user, fleetOwner: fleetOwnerId
//     });
//     if (credit != null) {
//       return res.status(200).json({
//         success: true,
//         message: "Credit fetched successfully",
//         result: credit,
//       });
//     } else {
//       return res.status(200).json({
//         success: false,
//       });
//     }
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       error: error,
//     });
//   }
// };
