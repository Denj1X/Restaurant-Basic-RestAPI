const { PrismaClient } = require("@prisma/client");
const { response, request } = require("express");
const { StatusCodes } = require("http-status-codes");
const { getUserIdFromToken, getRoleFromToken } = require("../parser");
const prisma = new PrismaClient();

const createReservation = async (request, response) => {
  try {
    const reservation = request.body;

    const table = await prisma.table.findUniqueOrThrow({
      where: { id: reservation.tableId },
    });

    const reservationDays = Math.floor(
      (new Date(reservation.reservationEndDate).getTime() -
        new Date().getTime()) /
        (1000 * 3600 * 24)
    );

    const fee = reservationDays * table.fee;
    const userId = parseInt(await getUserIdFromToken(request));

    const savedReservation = await prisma.reservation.create({
      data: { ...reservation, userId: userId, fee: fee },
    });

    await prisma.$transaction([
      prisma.restaurant.update({
        where: { id: parseInt(reservation.restaurantId) },
        data: {
          available_tables: {
            decrement: 1,
          },
        },
      }),
      prisma.table.update({
        where: { id: parseInt(reservation.tableId) },
        data: {
          available: false,
          reservedOn: new Date(),
          availableFrom: reservation.reservationEndDate,
        },
      }),
    ]);

    response.status(StatusCodes.CREATED).json(savedReservation);
  } catch (error) {
    response
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: `Error creating your reservation! ${error}` });
  }
};

const getAllReservations = async (request, response) => {
  try {
    const reservations = await prisma.reservation.findMany();
    response.status(StatusCodes.OK).json(reservations);
  } catch (error) {
    response
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: `Error fetching data: ${error}` });
  }
};

const getReservationById = async (request, response) => {
  try {
    const { id } = request.params;
    const userId = parseInt(await getUserIdFromToken(request));
    const role = await getRoleFromToken(request);

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: parseInt(id) },
    });

    if(role !== 'ADMIN' && userId !== reservation.userId) {
      throw new Error('You are not the owner of the reservation or an Admin!');
    }
    response.status(StatusCodes.OK).json(reservation);
  } catch (error) {
    response
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: `Error fetching data: ${error}` });
  }
};

const updateReservation = async (request, response) => {
  try {
    const { id } = request.params;
    const userId = parseInt(await getUserIdFromToken(request));
    const role = await getRoleFromToken(request);

    const existingReservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: parseInt(id) },
    });

    if(role !== 'ADMIN' && userId !== existingReservation.userId) {
      throw new Error('You are not the owner of the reservation or an Admin!');
    }

    const { reservationEndDate } = request.body;
    const reservationDays = Math.floor(
      Math.abs(
        (new Date(reservationEndDate).getTime() -
          new Date(existingReservation.reservationEndDate).getTime()) /
          (1000 * 3600 * 24)
      )
    );

    const table = await prisma.table.findUniqueOrThrow({
      where: { id: existingReservation.tableId },
    });

    const fee = reservationDays * table.fee;
    await prisma.table.update({
      where: { id: parseInt(existingReservation.tableId) },
      data: {
        availableFrom: reservationEndDate,
      },
    });

    const newFee =
      new Date(reservationEndDate).getTime() >
      existingReservation.reservationEndDate.getTime()
        ? existingReservation.fee + fee
        : existingReservation.fee - fee;

    const updatedReservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { reservationEndDate: reservationEndDate, fee: Math.abs(newFee) },
    });
    response.status(StatusCodes.OK).json(updatedReservation);
  } catch (error) {
    response
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: `Error updating your reservation! ${error}` });
  }
};

const deleteReservation = async (request, response) => {
  try {
    const { id } = request.params;
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: parseInt(id) },
    });

    const userId = parseInt(await getUserIdFromToken(request));
    const role = await getRoleFromToken(request);

    if(role !== 'ADMIN' && userId !== reservation.userId) {
      throw new Error('You are not the owner of the reservation or an Admin!');
    }

    await prisma.$transaction([
      prisma.restaurant.update({
        where: { id: parseInt(reservation.restaurantId) },
        data: {
          available_tables: {
            increment: 1,
          },
        },
      }),

      prisma.table.update({
        where: { id: reservation.tableId },
        data: {
          available: true,
          reservedOn: null,
          availableFrom: new Date(),
        },
      }),
    ]);

    const deletedReservation = await prisma.reservation.delete({
      where: { id: parseInt(id) },
    });
    response
      .status(StatusCodes.OK)
      .json({ message: `Reservation with ID ${id} succesfully deleted!` });
  } catch (error) {
    response
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: `Error deleting reservation: ${error}` });
  }
};

module.exports = {
  createReservation,
  getAllReservations,
  getReservationById,
  updateReservation,
  deleteReservation,
};